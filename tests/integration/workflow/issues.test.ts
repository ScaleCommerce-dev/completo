// Archived issues, the manual issue order, My Tasks' status categories and the
// workspace settings (interface mode, issue template).
import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard, createTestBoard, getBoard } from '../../setup/fixtures'
import { statusId } from './helpers'

describe('archived issues', () => {
  let owner: TestUser
  let project: { id: string, slug: string }
  let archived: { id: number }
  let open: { id: number }

  beforeAll(async () => {
    owner = await registerTestUser()
    project = await createTestProject(owner)
    const todo = await statusId(owner, project.id, 'To Do')
    open = await createTestCard(owner, project.id, todo, { title: 'still here', assigneeId: owner.id })
    archived = await createTestCard(owner, project.id, todo, { title: 'archivedneedle gone', assigneeId: owner.id })
    const res = await $fetch(`/api/cards/${archived.id}`, { method: 'PUT', headers: owner.headers, body: { archived: true } }) as { archivedAt: string | null }
    expect(res.archivedAt).toBeTruthy()
  })

  it('is out of /api/issues in every view', async () => {
    for (const view of ['active', 'backlog', 'all']) {
      const rows = await $fetch('/api/issues', { headers: owner.headers, query: { view, projectId: project.id } }) as Array<{ id: number }>
      expect(rows.map(r => r.id)).not.toContain(archived.id)
    }
    const all = await $fetch('/api/issues', { headers: owner.headers, query: { view: 'all', projectId: project.id } }) as Array<{ id: number }>
    expect(all.map(r => r.id)).toContain(open.id)
  })

  it('is out of the project card list, boards, my tasks and the project counts', async () => {
    const cards = await $fetch(`/api/projects/${project.id}/cards`, { headers: owner.headers }) as Array<{ id: number }>
    expect(cards.map(c => c.id)).toEqual([open.id])
    const board = await createTestBoard(owner, project.id)
    expect((await getBoard(owner, board.id)).cards.map(c => c.id)).not.toContain(archived.id)
    const mine = await $fetch('/api/my-tasks', { headers: owner.headers }) as { groups: Array<{ cards: Array<{ id: number }> }> }
    expect(mine.groups.flatMap(g => g.cards.map(c => c.id))).not.toContain(archived.id)
    const rows = await $fetch('/api/projects', { headers: owner.headers }) as Array<{ id: string, totalCards: number }>
    expect(rows.find(r => r.id === project.id)!.totalCards).toBe(1)
  })

  it('stays reachable by id and in search', async () => {
    const card = await $fetch(`/api/cards/${archived.id}`, { headers: owner.headers }) as { id: number, archivedAt: string | null }
    expect(card.archivedAt).toBeTruthy()
    const hits = await $fetch('/api/cards/search', { headers: owner.headers, query: { q: 'archivedneedle' } }) as Array<{ id: number }>
    expect(hits.map(h => h.id)).toContain(archived.id)
  })

  it('the issue list can ask for archived issues too, and unarchiving brings one back', async () => {
    const withArchived = await $fetch('/api/issues', { headers: owner.headers, query: { view: 'all', projectId: project.id, archived: 'include' } }) as Array<{ id: number, archivedAt: string | null }>
    expect(withArchived.find(r => r.id === archived.id)?.archivedAt).toBeTruthy()
    await $fetch(`/api/cards/${archived.id}`, { method: 'PUT', headers: owner.headers, body: { archived: false } })
    const rows = await $fetch('/api/issues', { headers: owner.headers, query: { view: 'all', projectId: project.id } }) as Array<{ id: number }>
    expect(rows.map(r => r.id)).toContain(archived.id)
    await $fetch(`/api/cards/${archived.id}`, { method: 'PUT', headers: owner.headers, body: { archived: true } })
  })

  it('refuses anything but a boolean', async () => {
    await expectError($fetch(`/api/cards/${open.id}`, { method: 'PUT', headers: owner.headers, body: { archived: 'yes' } }), 400)
  })
})

describe('manual issue order', () => {
  let owner: TestUser
  let projectId: string
  let backlog: string
  const ids: number[] = []

  beforeAll(async () => {
    owner = await registerTestUser()
    projectId = (await createTestProject(owner)).id
    backlog = await statusId(owner, projectId, 'Backlog')
    for (const n of [1, 2, 3]) ids.push((await createTestCard(owner, projectId, backlog, { title: `M${n}` })).id)
  })

  async function order() {
    const rows = await $fetch('/api/issues', { headers: owner.headers, query: { view: 'all', projectId } }) as Array<{ id: number, position: number }>
    return rows.sort((a, b) => a.position - b.position).map(r => r.id)
  }
  const move = (id: number, afterId: number | null) => $fetch(`/api/cards/${id}/move`, { method: 'PUT', headers: owner.headers, body: { statusId: backlog, afterId } })

  it('puts a card right after another card of the status, or first with afterId null', async () => {
    const [a, b, c] = ids as [number, number, number]
    await move(a, c)
    expect(await order()).toEqual([b, c, a])
    await move(a, null)
    expect(await order()).toEqual([a, b, c])
    await move(c, a)
    expect(await order()).toEqual([a, c, b])
  })

  it('refuses an afterId that is not a card of the target status', async () => {
    await expectError(move(ids[0]!, 999999), 400)
    await expectError(move(ids[0]!, ids[0]!), 400)
  })
})

describe('my tasks', () => {
  it('names each status category, so a client can hide closed issues', async () => {
    const owner = await registerTestUser()
    const projectId = (await createTestProject(owner)).id
    await createTestCard(owner, projectId, await statusId(owner, projectId, 'Done'), { title: 'Mine done', assigneeId: owner.id })
    const data = await $fetch('/api/my-tasks', { headers: owner.headers }) as {
      groups: Array<{ project: { id: string }, statuses: Array<{ name: string, category: string }>, cards: Array<{ title: string, status: { category: string } | null }> }>
    }
    const group = data.groups.find(g => g.project.id === projectId)!
    expect(group.statuses.find(s => s.name === 'Done')!.category).toBe('completed')
    expect(group.cards.find(c => c.title === 'Mine done')!.status!.category).toBe('completed')
  })
})

describe('workspace settings', () => {
  let admin: TestUser
  let member: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    member = await registerTestUser()
  })

  it('every signed-in user reads them; a workspace starts standard with no issue template', async () => {
    expect(await $fetch('/api/settings', { headers: member.headers })).toEqual({ interfaceMode: 'standard', issueTemplate: '' })
    await expectError($fetch('/api/settings'), 401)
  })

  it('admins change them on the settings endpoint; members may not', async () => {
    const s = await $fetch('/api/admin/settings', { headers: admin.headers }) as Record<string, unknown>
    expect(s).toMatchObject({ interfaceMode: 'standard', issueTemplate: '' })
    await expectError($fetch('/api/admin/settings', { method: 'PUT', headers: member.headers, body: { interfaceMode: 'tracker' } }), 403)
    await expectError($fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { interfaceMode: 'fancy' } }), 400)
    await expectError($fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { issueTemplate: 42 } }), 400)
    try {
      const saved = await $fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { interfaceMode: 'tracker', issueTemplate: '## Notes\n' } }) as Record<string, unknown>
      expect(saved).toMatchObject({ interfaceMode: 'tracker', issueTemplate: '## Notes\n' })
      expect(await $fetch('/api/settings', { headers: member.headers })).toEqual({ interfaceMode: 'tracker', issueTemplate: '## Notes\n' })
    } finally {
      await $fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { interfaceMode: 'standard', issueTemplate: '' } })
    }
  })

  it('a rejected request saves nothing', async () => {
    await expectError($fetch('/api/admin/settings', { method: 'PUT', headers: admin.headers, body: { interfaceMode: 'tracker', allowedEmailDomains: ['not a domain'] } }), 400)
    expect((await $fetch('/api/settings', { headers: member.headers }) as { interfaceMode: string }).interfaceMode).toBe('standard')
  })
})
