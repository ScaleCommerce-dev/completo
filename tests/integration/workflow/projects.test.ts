// What a projects table needs per row (lead, progress, current milestone), the
// manual project order, project priority and the project activity feed.
import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard } from '../../setup/fixtures'
import { statusId, addStatus } from './helpers'

interface Row {
  id: string
  name: string
  position: number
  lead: { id: string, name: string } | null
  totalCards: number
  scopeCards: number
  completedCards: number
  currentMilestone: { id: string, name: string } | null
}

describe('GET /api/projects for a projects table', () => {
  let owner: TestUser
  let project: { id: string }
  let empty: { id: string }
  const status: Record<string, string> = {}

  async function row(id: string) {
    const rows = await $fetch('/api/projects', { headers: owner.headers }) as Row[]
    return rows.find(r => r.id === id)!
  }

  async function milestone(name: string) {
    return await $fetch(`/api/projects/${project.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name } }) as { id: string }
  }

  async function card(statusName: string, milestoneId?: string) {
    const c = await createTestCard(owner, project.id, status[statusName]!)
    if (milestoneId) await $fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId } })
    return c
  }

  beforeAll(async () => {
    owner = await registerTestUser({ name: 'Lead Person' })
    project = await createTestProject(owner)
    empty = await createTestProject(owner)
    for (const name of ['Backlog', 'To Do', 'In Progress', 'Done']) status[name] = await statusId(owner, project.id, name)
    status.Canceled = await addStatus(owner, project.id, 'Canceled')
    status.Duplicate = await addStatus(owner, project.id, 'Duplicate')
  })

  it('names the lead, or null without one', async () => {
    expect((await row(project.id)).lead).toBeNull()
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: owner.headers, body: { leadId: owner.id } })
    expect((await row(project.id)).lead).toMatchObject({ id: owner.id, name: 'Lead Person' })
  })

  it('counts progress by category: canceled and duplicate leave the scope, only completed is done', async () => {
    for (const s of ['Backlog', 'To Do', 'In Progress', 'Done', 'Canceled', 'Duplicate']) await card(s)
    const r = await row(project.id)
    expect(r.totalCards).toBe(6)
    expect(r.scopeCards).toBe(4)
    expect(r.completedCards).toBe(1)
  })

  it('has no current milestone without milestones', async () => {
    expect((await row(empty.id)).currentMilestone).toBeNull()
  })

  it('picks the first milestone by position that still has an open issue', async () => {
    const m0 = await milestone('M0 done')
    const m1 = await milestone('M1 open')
    await milestone('M2 empty')
    await card('Done', m0.id)
    await card('Canceled', m0.id)
    await card('Done', m1.id)
    await card('To Do', m1.id)
    expect((await row(project.id)).currentMilestone).toEqual({ id: m1.id, name: 'M1 open' })
  })

  it('has no current milestone once every milestone is closed or empty', async () => {
    const m = await $fetch(`/api/projects/${empty.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'only' } }) as { id: string }
    const c = await createTestCard(owner, empty.id, await statusId(owner, empty.id, 'Done'))
    await $fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId: m.id } })
    expect((await row(empty.id)).currentMilestone).toBeNull()
  })
})

describe('manual project order', () => {
  let admin: TestUser
  let member: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    member = await registerTestUser()
  })

  /** The API lists alphabetically; a client offering the manual order sorts by position. */
  async function byPosition(u: TestUser) {
    const rows = await $fetch('/api/projects', { headers: u.headers }) as Row[]
    return [...rows].sort((a, b) => a.position - b.position)
  }

  it('a new project goes last in the manual order, while the list stays alphabetical', async () => {
    const z = await createTestProject(admin, { name: `zz Order ${Date.now()}` })
    const a = await createTestProject(admin, { name: `aa Order ${Date.now()}` })
    const rows = await byPosition(admin)
    expect(rows.at(-1)!.id).toBe(a.id)
    expect(rows.at(-2)!.id).toBe(z.id)
    const listed = (await $fetch('/api/projects', { headers: admin.headers }) as Row[]).map(r => r.id)
    expect(listed.indexOf(a.id)).toBeLessThan(listed.indexOf(z.id))
  })

  it('an admin reorders; the listed ids come first, the rest keep their order after them', async () => {
    const a = await createTestProject(admin, { name: `Reorder A ${Date.now()}` })
    const b = await createTestProject(admin, { name: `Reorder B ${Date.now()}` })
    const before = (await byPosition(admin)).map(r => r.id)
    await $fetch('/api/projects/reorder', { method: 'PUT', headers: admin.headers, body: { projectIds: [b.id, a.id] } })
    const after = (await byPosition(admin)).map(r => r.id)
    expect(after.slice(0, 2)).toEqual([b.id, a.id])
    expect(after.slice(2)).toEqual(before.filter(id => id !== a.id && id !== b.id))
  })

  it('the order is global: a member sees the admin\'s order', async () => {
    const a = await createTestProject(member, { name: `Member A ${Date.now()}` })
    const b = await createTestProject(member, { name: `Member B ${Date.now()}` })
    await $fetch('/api/projects/reorder', { method: 'PUT', headers: admin.headers, body: { projectIds: [b.id, a.id] } })
    expect((await byPosition(member)).map(r => r.id)).toEqual([b.id, a.id])
  })

  it('only instance admins may reorder, and empty, unknown or repeated ids are refused', async () => {
    const p = await createTestProject(member)
    await expectError($fetch('/api/projects/reorder', { method: 'PUT', headers: member.headers, body: { projectIds: [p.id] } }), 403)
    await expectError($fetch('/api/projects/reorder', { method: 'PUT', headers: admin.headers, body: { projectIds: [] } }), 400)
    await expectError($fetch('/api/projects/reorder', { method: 'PUT', headers: admin.headers, body: { projectIds: ['nope'] } }), 400)
    await expectError($fetch('/api/projects/reorder', { method: 'PUT', headers: admin.headers, body: { projectIds: [p.id, p.id] } }), 400)
  })
})

describe('priority', () => {
  let owner: TestUser
  let project: { id: string }

  beforeAll(async () => {
    owner = await registerTestUser()
    project = await createTestProject(owner)
  })

  it('an explicit null on create is "No priority"; leaving it out is still medium', async () => {
    const todo = await statusId(owner, project.id, 'To Do')
    const none = await $fetch(`/api/projects/${project.id}/cards`, { method: 'POST', headers: owner.headers, body: { statusId: todo, title: 'none', priority: null } }) as { priority: string | null }
    expect(none.priority).toBeNull()
    const plain = await $fetch(`/api/projects/${project.id}/cards`, { method: 'POST', headers: owner.headers, body: { statusId: todo, title: 'plain' } }) as { priority: string | null }
    expect(plain.priority).toBe('medium')
  })

  it('a project has a priority, null by default, validated on update', async () => {
    const p = await $fetch(`/api/projects/${project.id}`, { headers: owner.headers }) as { priority: string | null }
    expect(p.priority).toBeNull()
    const updated = await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: owner.headers, body: { priority: 'high' } }) as { priority: string | null }
    expect(updated.priority).toBe('high')
    await expectError($fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: owner.headers, body: { priority: 'huge' } }), 400)
    const cleared = await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: owner.headers, body: { priority: null } }) as { priority: string | null }
    expect(cleared.priority).toBeNull()
  })
})

interface FeedItem {
  id: string
  source: 'project' | 'card'
  type: string
  data: Record<string, unknown>
  createdAt: string
  actor: { id: string, name: string } | null
  card?: { id: number, title?: string, hidden?: true }
}

describe('project activity', () => {
  let owner: TestUser
  let colleague: TestUser
  let outsider: TestUser
  let project: { id: string }
  let elsewhere: { id: string }

  async function feed(u: TestUser = owner) {
    return await $fetch(`/api/projects/${project.id}/activity`, { headers: u.headers }) as FeedItem[]
  }

  beforeAll(async () => {
    owner = await registerTestUser({ name: 'Owner Person' })
    colleague = await registerTestUser({ name: 'Colleague Person' })
    outsider = await registerTestUser()
    project = await createTestProject(owner)
    elsewhere = await createTestProject(colleague)
  })

  it('records the project\'s own changes, one row per changed field, newest first', async () => {
    await $fetch(`/api/projects/${project.id}/members`, { method: 'POST', headers: owner.headers, body: { userId: colleague.id } })
    await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: owner.headers,
      body: { state: 'started', priority: 'urgent', leadId: colleague.id, targetDate: '2026-10-01', targetDateResolution: 'quarter', name: `Renamed project ${Date.now()}` }
    })
    // Unchanged values leave no row.
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', headers: owner.headers, body: { state: 'started' } })

    const items = await feed()
    const types = items.filter(i => i.source === 'project').map(i => i.type)
    expect(types.filter(t => t === 'state')).toHaveLength(1)
    expect(types).toEqual(expect.arrayContaining(['member_added', 'state', 'priority', 'lead', 'target_date', 'name']))
    expect(items.find(i => i.type === 'state')!.data).toMatchObject({ from: 'planned', to: 'started' })
    expect(items.find(i => i.type === 'lead')!.data).toMatchObject({ from: null, to: 'Colleague Person' })
    expect(items.find(i => i.type === 'target_date')!.data).toMatchObject({ to: '2026-10-01', toResolution: 'quarter' })
    expect(items.find(i => i.type === 'member_added')!.data).toMatchObject({ name: 'Colleague Person' })
    expect(items.find(i => i.type === 'state')!.actor).toMatchObject({ id: owner.id, name: 'Owner Person' })
    // The member was added before the update, so it is further down.
    expect(items.findIndex(i => i.type === 'member_added')).toBeGreaterThan(items.findIndex(i => i.type === 'state'))
  })

  it('records milestones added, renamed and removed', async () => {
    const m = await $fetch(`/api/projects/${project.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'M0' } }) as { id: string }
    await $fetch(`/api/milestones/${m.id}`, { method: 'PUT', headers: owner.headers, body: { name: 'M0 Foundations' } })
    await $fetch(`/api/milestones/${m.id}`, { method: 'PUT', headers: owner.headers, body: { targetDate: '2026-12-01' } })
    await $fetch(`/api/milestones/${m.id}`, { method: 'DELETE', headers: owner.headers })
    const items = (await feed()).filter(i => i.type.startsWith('milestone'))
    expect(items.map(i => [i.type, i.data])).toEqual([
      ['milestone_removed', { name: 'M0 Foundations' }],
      ['milestone_renamed', { from: 'M0', to: 'M0 Foundations' }],
      ['milestone_added', { name: 'M0' }]
    ])
  })

  it('records a member removed', async () => {
    const extra = await registerTestUser({ name: 'Leaving Person' })
    await $fetch(`/api/projects/${project.id}/members`, { method: 'POST', headers: owner.headers, body: { userId: extra.id } })
    await $fetch(`/api/projects/${project.id}/members/${extra.id}`, { method: 'DELETE', headers: owner.headers })
    const items = await feed()
    expect(items[0]).toMatchObject({ source: 'project', type: 'member_removed', data: { name: 'Leaving Person' } })
  })

  it('merges in the history of the project\'s cards, with refs that hide unreadable cards', async () => {
    const todo = await statusId(owner, project.id, 'To Do')
    const done = await statusId(owner, project.id, 'Done')
    const card = await createTestCard(owner, project.id, todo, { title: 'feed card' })
    await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { statusId: done } })
    // A blocker in a project the owner cannot read, linked by the colleague who reads both.
    const secret = await createTestCard(colleague, elsewhere.id, await statusId(colleague, elsewhere.id, 'To Do'), { title: 'secret title' })
    await $fetch(`/api/cards/${card.id}/relations`, { method: 'POST', headers: colleague.headers, body: { type: 'blocked_by', cardId: secret.id } })

    const items = await feed()
    const cardItems = items.filter(i => i.source === 'card')
    expect(cardItems.slice(0, 3).map(i => i.type)).toEqual(['relation_added', 'status', 'created'])
    expect(cardItems[0]!.card).toMatchObject({ id: card.id, title: 'feed card' })
    expect(cardItems[0]!.data).toMatchObject({ relation: 'blocked_by', cardId: secret.id, cardIdRef: { id: secret.id, hidden: true } })
    expect(JSON.stringify(items)).not.toContain('secret title')
    expect(cardItems[1]!.data).toMatchObject({ from: 'To Do', to: 'Done' })
    // The colleague reads both projects and sees the title.
    const theirs = (await feed(colleague)).find(i => i.type === 'relation_added')!
    expect(theirs.data.cardIdRef).toMatchObject({ id: secret.id, title: 'secret title' })
    // Newest first across both sources.
    const times = items.map(i => new Date(i.createdAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('is limited to 100 entries', async () => {
    const todo = await statusId(owner, project.id, 'To Do')
    for (let i = 0; i < 101; i++) await createTestCard(owner, project.id, todo, { title: `bulk ${i}` })
    expect((await feed())).toHaveLength(100)
  })

  it('is 404 for a non-member', async () => {
    await expectError($fetch(`/api/projects/${project.id}/activity`, { headers: outsider.headers }), 404)
  })
})
