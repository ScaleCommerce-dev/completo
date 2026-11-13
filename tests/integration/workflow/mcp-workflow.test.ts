// The MCP side of the issue workflow, driven as an agent drives it: raw JSON-RPC.
import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, createTestToken } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

let nextId = 1
async function call(headers: Record<string, string>, name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(url('/mcp'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } })
  })
  expect(res.status).toBe(200)
  const body = await res.json() as { result: { isError: boolean, content: Array<{ text: string }> } }
  return { isError: body.result.isError, text: body.result.content[0]!.text, data: body.result.isError ? null : JSON.parse(body.result.content[0]!.text) }
}

describe('MCP workflow tools', () => {
  let headers: Record<string, string>
  let projectA: { id: string, slug: string, name: string, key: string }
  let projectB: { id: string, slug: string, name: string, key: string }

  beforeAll(async () => {
    const user = await registerTestUser()
    headers = (await createTestToken(user)).headers
    projectA = await createTestProject(user, { name: `MCP A ${Date.now()}` })
    projectB = await createTestProject(user, { name: `MCP B ${Date.now()}` })
    await $fetch(`/api/projects/${projectB.id}/statuses`, { method: 'POST', headers: user.headers, body: { name: 'Waiting' } })
  })

  it('creates a sub-issue in a milestone, links blockers, and reads it all back on get_card', async () => {
    await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers, body: { name: 'Foundations' } })

    const parent = await call(headers, 'create_card', { project: projectA.name, title: 'Parent issue' })
    expect(parent.data.ticket).toBe(`${projectA.key}-${parent.data.ticket.split('-')[1]}`)
    const child = await call(headers, 'create_card', { project: projectA.slug, title: 'Child issue', parent: parent.data.ticket, milestone: 'Foundations', status: 'To Do' })
    expect(child.data).toMatchObject({ parent: { ticket: parent.data.ticket, title: 'Parent issue' }, milestone: 'Foundations', status: 'To Do' })

    const other = await call(headers, 'create_card', { project: projectB.slug, title: 'in B' })
    const linked = await call(headers, 'link_cards', { card: child.data.ticket, type: 'blocked_by', other: other.data.ticket })
    expect(linked.data.blockedBy).toEqual([{ ticket: other.data.ticket, title: 'in B', status: 'Backlog' }])

    const p = await call(headers, 'get_card', { card: parent.data.ticket })
    expect(p.data.subIssues.map((c: { ticket: string }) => c.ticket)).toEqual([child.data.ticket])
    expect(p.data.subIssueProgress).toEqual({ total: 1, completed: 0 })

    const unlinked = await call(headers, 'unlink_cards', { card: other.data.ticket, other: child.data.ticket })
    expect(unlinked.data.blocks).toEqual([])
  })

  it('update_card clears the parent and moves a card to another project with a status there', async () => {
    const parent = await call(headers, 'create_card', { project: projectA.slug, title: 'P' })
    const card = await call(headers, 'create_card', { project: projectA.slug, title: 'mover', parent: parent.data.ticket })
    const cleared = await call(headers, 'update_card', { card: card.data.ticket, parent: '' })
    expect(cleared.data).toMatchObject({ parent: null })

    const moved = await call(headers, 'update_card', { card: card.data.ticket, project: projectB.slug, status: 'Waiting' })
    expect(moved.data).toMatchObject({ project: projectB.slug, status: 'Waiting', ticket: `${projectB.key}-${card.data.ticket.split('-')[1]}` })
  })

  it('list_issues finds active work across projects with relation counts', async () => {
    const blocker = await call(headers, 'create_card', { project: projectA.slug, title: 'blocker', status: 'In Progress' })
    const blocked = await call(headers, 'create_card', { project: projectB.slug, title: 'blocked', status: 'To Do' })
    await call(headers, 'link_cards', { card: blocker.data.ticket, type: 'blocks', other: blocked.data.ticket })

    const active = await call(headers, 'list_issues', { view: 'active' })
    const row = (t: string) => active.data.find((i: { ticket: string }) => i.ticket === t)
    expect(row(blocker.data.ticket)).toMatchObject({ category: 'started', blocks: 1, blockedBy: 0, project: projectA.slug })
    expect(row(blocked.data.ticket)).toMatchObject({ category: 'unstarted', blocks: 0, blockedBy: 1, project: projectB.slug })

    const onlyB = await call(headers, 'list_issues', { view: 'active', project: projectB.slug })
    expect(onlyB.data.every((i: { project: string }) => i.project === projectB.slug)).toBe(true)
  })

  it('create_card starts with the workspace issue template when one is set and no description is given', async () => {
    const plain = await call(headers, 'create_card', { project: projectA.slug, title: 'no template yet' })
    expect(plain.data.description).toBe('')
    const admin = await createAdminUser()
    try {
      await $fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { issueTemplate: '## Notes\n\n- [ ] Done' } })
      const templated = await call(headers, 'create_card', { project: projectA.slug, title: 'with template' })
      expect(templated.data.description).toBe('## Notes\n\n- [ ] Done')
      const own = await call(headers, 'create_card', { project: projectA.slug, title: 'own text', description: 'My own text' })
      expect(own.data.description).toBe('My own text')
    } finally {
      await $fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { issueTemplate: '' } })
    }
  })

  it('archiving through update_card takes the card out of list_issues and list_cards', async () => {
    const card = await call(headers, 'create_card', { project: projectA.slug, title: 'to archive', status: 'To Do' })
    await call(headers, 'update_card', { card: card.data.ticket, archived: true })
    const all = await call(headers, 'list_issues', { view: 'all', project: projectA.slug })
    expect(all.data.map((i: { ticket: string }) => i.ticket)).not.toContain(card.data.ticket)
    const cards = await call(headers, 'list_cards', { project: projectA.slug })
    expect(cards.data.map((i: { ticket: string }) => i.ticket)).not.toContain(card.data.ticket)
  })

  it('lists milestones and names a missing one', async () => {
    const list = await call(headers, 'list_milestones', { project: projectA.slug })
    expect(list.data.map((m: { name: string }) => m.name)).toContain('Foundations')
    const res = await call(headers, 'create_card', { project: projectA.slug, title: 'x', milestone: 'Nope' })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('Unknown milestone "Nope"')
  })
})
