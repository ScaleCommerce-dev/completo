// What moving, archiving, replying and leaving a project must keep consistent.
import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, createTestToken, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard, uploadAttachment } from '../../setup/fixtures'
import { createTestAgent, addMember as addAgentMember } from '../../setup/agents'
import { statuses, statusId, addMember } from './helpers'

interface CardDetail {
  position: number
  statusId: string
  childProgress: { total: number, completed: number }
}

async function getCard(u: TestUser, id: number) {
  return await $fetch(`/api/cards/${id}`, { headers: u.headers }) as CardDetail
}

describe('moving a card keeps what belongs to it with it', () => {
  let owner: TestUser
  let onlyA: TestUser
  let onlyB: TestUser
  let projectA: { id: string }
  let projectB: { id: string }

  beforeAll(async () => {
    owner = await registerTestUser()
    onlyA = await registerTestUser()
    onlyB = await registerTestUser()
    projectA = await createTestProject(owner)
    projectB = await createTestProject(owner)
    await addMember(owner, projectA.id, onlyA)
    await addMember(owner, projectB.id, onlyB)
  })

  it('its attachments follow it: the old project\'s members lose them, the new project\'s get them', async () => {
    const card = await createTestCard(owner, projectA.id, await statusId(owner, projectA.id, 'To Do'))
    const attachment = await uploadAttachment(owner, card.id, { filename: 'notes.txt', content: 'moved along' }) as { id: string }

    await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { projectId: projectB.id } })

    const fromA = await fetch(url(`/api/attachments/${attachment.id}/download`), { headers: onlyA.headers })
    expect(fromA.status).toBe(404)
    const fromB = await fetch(url(`/api/attachments/${attachment.id}/download`), { headers: onlyB.headers })
    expect(fromB.status).toBe(200)
    expect(await fromB.text()).toBe('moved along')
    await expectError($fetch(`/api/attachments/${attachment.id}`, { method: 'DELETE', headers: onlyA.headers }), 404)
  })

  it('it goes last in the target status', async () => {
    const todoB = await statusId(owner, projectB.id, 'To Do')
    const first = await createTestCard(owner, projectB.id, todoB)
    const second = await createTestCard(owner, projectB.id, todoB)
    const card = await createTestCard(owner, projectA.id, await statusId(owner, projectA.id, 'To Do'))

    await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { projectId: projectB.id } })

    const moved = await getCard(owner, card.id)
    expect(moved.statusId).toBe(todoB)
    const others = [await getCard(owner, first.id), await getCard(owner, second.id)]
    expect(moved.position).toBeGreaterThan(Math.max(...others.map(c => c.position)))
  })
})

describe('filtering a project\'s cards by parent and milestone', () => {
  let owner: TestUser
  let project: { id: string, slug: string }
  let backlog: string

  beforeAll(async () => {
    owner = await registerTestUser()
    project = await createTestProject(owner)
    backlog = await statusId(owner, project.id, 'Backlog')
  })

  it('narrows the list on the server, past the first page', async () => {
    const parent = await createTestCard(owner, project.id, backlog)
    for (let i = 0; i < 3; i++) await createTestCard(owner, project.id, backlog)
    const child = await createTestCard(owner, project.id, backlog)
    await $fetch(`/api/cards/${child.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: parent.id } })
    const ms = await $fetch(`/api/projects/${project.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'Filter me' } }) as { id: string }
    const inMs = await createTestCard(owner, project.id, backlog)
    await $fetch(`/api/cards/${inMs.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId: ms.id } })

    const byParent = await $fetch(`/api/projects/${project.id}/cards`, { headers: owner.headers, query: { parentId: parent.id, limit: 1 } }) as Array<{ id: number }>
    expect(byParent.map(c => c.id)).toEqual([child.id])
    const byMilestone = await $fetch(`/api/projects/${project.id}/cards`, { headers: owner.headers, query: { milestoneId: ms.id, limit: 1 } }) as Array<{ id: number }>
    expect(byMilestone.map(c => c.id)).toEqual([inMs.id])
  })

  it('MCP list_cards passes them on, so a sub-issue outside the first page is still found', async () => {
    const headers = (await createTestToken(owner)).headers
    const parent = await createTestCard(owner, project.id, backlog, { title: 'mcp parent' })
    await createTestCard(owner, project.id, backlog)
    const child = await createTestCard(owner, project.id, backlog, { title: 'mcp child' })
    await $fetch(`/api/cards/${child.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: parent.id } })
    const projectKey = (await $fetch(`/api/projects/${project.id}`, { headers: owner.headers }) as { key: string }).key

    const res = await fetch(url('/mcp'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_cards', arguments: { project: project.slug, parent: `${projectKey}-${parent.id}`, limit: 1 } } })
    })
    const body = await res.json() as { result: { isError: boolean, content: Array<{ text: string }> } }
    expect(body.result.isError).toBe(false)
    const cards = JSON.parse(body.result.content[0]!.text) as Array<{ title: string }>
    expect(cards.map(c => c.title)).toEqual(['mcp child'])
  })
})

describe('a card\'s history across the project boundary', () => {
  it('shows a parent in a project the viewer cannot read by its id only, never its key', async () => {
    const owner = await registerTestUser()
    const member = await registerTestUser()
    const projectA = await createTestProject(owner)
    const projectB = await createTestProject(owner)
    await addMember(owner, projectA.id, member)
    const secret = await createTestCard(owner, projectB.id, await statusId(owner, projectB.id, 'Backlog'))
    const card = await createTestCard(owner, projectA.id, await statusId(owner, projectA.id, 'Backlog'))
    await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: secret.id } })

    const { events } = await $fetch(`/api/cards/${card.id}/history`, { headers: member.headers }) as { events: Array<{ field: string, to: { id: string | null, value: string, card?: { hidden?: boolean } } | null }> }
    const parent = events.find(e => e.field === 'parent')!
    expect(parent.to).toEqual({ id: String(secret.id), value: `#${secret.id}`, card: { id: secret.id, hidden: true } })
    expect(JSON.stringify(events)).not.toContain(projectB.key)
  })
})

describe('archived cards are out of the counts', () => {
  it('a sub-issue\'s progress and a person\'s open-card counts leave archived cards out', async () => {
    const owner = await registerTestUser()
    const project = await createTestProject(owner)
    const backlog = await statusId(owner, project.id, 'Backlog')
    const parent = await createTestCard(owner, project.id, backlog)
    const kept = await createTestCard(owner, project.id, backlog, { assigneeId: owner.id })
    const archived = await createTestCard(owner, project.id, backlog, { assigneeId: owner.id })
    for (const c of [kept, archived]) {
      await $fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: parent.id } })
    }
    const profileBefore = await $fetch('/api/user/profile', { headers: owner.headers }) as { totalOpen: number, projects: Array<{ id: string, openCards: number }> }

    await $fetch(`/api/cards/${archived.id}`, { method: 'PUT', headers: owner.headers, body: { archived: true } })

    expect((await getCard(owner, parent.id)).childProgress).toEqual({ total: 1, completed: 0 })
    const profile = await $fetch('/api/user/profile', { headers: owner.headers }) as { totalOpen: number, projects: Array<{ id: string, openCards: number }> }
    expect(profile.totalOpen).toBe(profileBefore.totalOpen - 1)
    const openIn = (p: typeof profile) => p.projects.find(x => x.id === project.id)!.openCards
    expect(openIn(profile)).toBe(openIn(profileBefore) - 1)
  })
})

describe('project lead', () => {
  let admin: TestUser
  let project: { id: string }

  beforeAll(async () => {
    admin = await createAdminUser()
    project = await createTestProject(admin)
  })

  async function leadId() {
    return (await $fetch(`/api/projects/${project.id}`, { headers: admin.headers }) as { leadId: string | null }).leadId
  }

  it('is cleared when the lead leaves the project', async () => {
    const member = await registerTestUser()
    await addMember(admin, project.id, member)
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: admin.headers, body: { leadId: member.id } })
    expect(await leadId()).toBe(member.id)

    await $fetch(`/api/projects/${project.id}/members/${member.id}`, { method: 'DELETE', headers: admin.headers })
    expect(await leadId()).toBeNull()
  })

  it('is cleared when an admin lead leaves the project', async () => {
    const otherAdmin = await createAdminUser()
    await addMember(admin, project.id, otherAdmin)
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: admin.headers, body: { leadId: otherAdmin.id } })

    await $fetch(`/api/projects/${project.id}/members/${otherAdmin.id}`, { method: 'DELETE', headers: admin.headers })
    expect(await leadId()).toBeNull()
  })

  it('is never an agent', async () => {
    const agent = await createTestAgent(admin)
    await addAgentMember(admin, project.id, agent.id)
    await expectError($fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: admin.headers, body: { leadId: agent.id } }), 400)
  })
})

describe('the done status', () => {
  it('a new done status is completed, and the old one stops counting as done', async () => {
    const owner = await registerTestUser()
    const project = await createTestProject(owner)
    const review = await statusId(owner, project.id, 'Review')
    const done = await statusId(owner, project.id, 'Done')

    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: owner.headers, body: { doneStatusId: review } })

    const byId = new Map((await statuses(owner, project.id)).map(s => [s.id, s.category]))
    expect(byId.get(review)).toBe('completed')
    expect(byId.get(done)).toBe('unstarted')
  })
})
