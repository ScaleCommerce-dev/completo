import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { addProjectMember, createTestCard, createTestProject, createTestTag, setCardTags } from '../setup/fixtures'

interface Project { id: string, slug: string, statuses: Array<{ id: string, name: string }> }
interface CalCard { id: number, title: string, projectId: string, dueDate: string | null, parent: { title: string } | null, board: { name: string } | null }
interface Calendar {
  cards: CalCard[]
  undated: CalCard[]
  projects: Array<{ id: string }>
  tags: Array<{ name: string }>
  people: Array<{ id: string }>
  statuses: Array<{ projectId: string, name: string }>
}

describe('Calendar', () => {
  let owner: TestUser // member of A and B
  let colleague: TestUser // member of A only
  let stranger: TestUser // owns C
  let a: Project
  let b: Project
  let c: Project
  let postA: number
  let subtaskB: number
  let quietSubtask: number
  let plainA: number
  let undatedA: number

  const project = async (user: TestUser) => {
    const created = await createTestProject(user) as { slug: string }
    return await $fetch(`/api/projects/${created.slug}`, { headers: user.headers }) as Project
  }
  const status = (p: Project, name: string) => p.statuses.find(s => s.name === name)!.id
  const send = (user: TestUser, path: string, method: string, body?: Record<string, unknown>) =>
    fetch(url(path), { method, headers: { ...user.headers, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  const calendar = (user: TestUser, query: Record<string, string | string[]>) =>
    $fetch('/api/calendar', { headers: user.headers, query: { from: '2026-11-23', to: '2026-11-29', ...query } }) as Promise<Calendar>
  const ids = (cards: CalCard[]) => cards.map(card => card.id).sort((x, y) => x - y)

  beforeAll(async () => {
    owner = await registerTestUser()
    colleague = await registerTestUser()
    stranger = await registerTestUser()
    a = await project(owner)
    b = await project(owner)
    c = await project(stranger)
    await addProjectMember(owner, a.id, { userId: colleague.id })

    // The same tag name in three projects, spelled three ways.
    const tagA = await createTestTag(owner, a.id, { name: 'Redaktionsplan' })
    const tagB = await createTestTag(owner, b.id, { name: 'redaktionsplan' })
    const tagC = await createTestTag(stranger, c.id, { name: 'Redaktionsplan' })

    postA = (await createTestCard(owner, a.id, status(a, 'To Do'), { title: 'LinkedIn post', dueDate: '2026-11-23', assigneeId: owner.id })).id
    await setCardTags(owner, postA, [tagA.id])
    plainA = (await createTestCard(owner, a.id, status(a, 'Backlog'), { title: 'Untagged task', dueDate: '2026-11-24' })).id
    undatedA = (await createTestCard(owner, a.id, status(a, 'Backlog'), { title: 'Blog idea' })).id
    await setCardTags(owner, undatedA, [tagA.id])
    const later = await createTestCard(owner, a.id, status(a, 'Backlog'), { title: 'Next month', dueDate: '2026-12-15' })
    await setCardTags(owner, later.id, [tagA.id])

    // A tagged parent, a tagged sub-task and an untagged one.
    const campaign = await createTestCard(owner, b.id, status(b, 'Backlog'), { title: 'Spring campaign' })
    await setCardTags(owner, campaign.id, [tagB.id])
    subtaskB = (await (await send(owner, `/api/projects/${b.id}/cards`, 'POST', { title: 'Newsletter', statusId: status(b, 'In Progress'), parentId: campaign.id, dueDate: '2026-11-25' })).json() as { id: number }).id
    await setCardTags(owner, subtaskB, [tagB.id])
    quietSubtask = (await (await send(owner, `/api/projects/${b.id}/cards`, 'POST', { title: 'Internal prep', statusId: status(b, 'Backlog'), parentId: campaign.id, dueDate: '2026-11-26' })).json() as { id: number }).id

    const foreign = await createTestCard(stranger, c.id, status(c, 'Backlog'), { title: 'Someone else\'s post', dueDate: '2026-11-23' })
    await setCardTags(stranger, foreign.id, [tagC.id])
  })

  describe('cards', () => {
    it('collects tagged cards and sub-tasks from all the caller\'s projects, by tag name', async () => {
      const cal = await calendar(owner, { tags: 'Redaktionsplan' })
      expect(ids(cal.cards)).toEqual([postA, subtaskB].sort((x, y) => x - y))
      const sub = cal.cards.find(card => card.id === subtaskB)!
      expect(sub.projectId).toBe(b.id)
      expect(sub.parent?.title).toBe('Spring campaign')
      expect(sub.dueDate?.slice(0, 10)).toBe('2026-11-25')
    })

    it('leaves out a sub-task whose only tag is on its parent, and cards outside the window', async () => {
      const cal = await calendar(owner, { tags: 'Redaktionsplan' })
      expect(ids(cal.cards)).not.toContain(quietSubtask)
      expect(cal.cards.map(card => card.title)).not.toContain('Next month')
    })

    it('lists tagged cards without a due date separately, and only when a tag is chosen', async () => {
      expect(ids((await calendar(owner, { tags: 'Redaktionsplan' })).undated)).toContain(undatedA)
      expect((await calendar(owner, {})).undated).toEqual([])
    })

    it('shows every card due in the window when no tag is chosen', async () => {
      const cal = await calendar(owner, {})
      expect(ids(cal.cards)).toEqual(expect.arrayContaining([postA, plainA, subtaskB, quietSubtask]))
    })

    it('filters by person, project and status name', async () => {
      expect(ids((await calendar(owner, { people: owner.id })).cards)).toEqual([postA])
      expect(ids((await calendar(owner, { projects: b.id })).cards)).toEqual([subtaskB, quietSubtask].sort((x, y) => x - y))
      expect(ids((await calendar(owner, { statuses: 'in progress' })).cards)).toEqual([subtaskB])
    })

    it('shows nobody cards from projects they are not a member of', async () => {
      expect((await calendar(owner, { tags: 'Redaktionsplan' })).cards.map(card => card.title)).not.toContain('Someone else\'s post')
      const theirs = await calendar(colleague, { tags: 'Redaktionsplan' })
      expect(ids(theirs.cards)).toEqual([postA])
      expect(theirs.projects.map(p => p.id)).toEqual([a.id])
      // A stranger's calendar holds only their own project.
      expect((await calendar(stranger, { tags: 'Redaktionsplan' })).cards.map(card => card.title)).toEqual(['Someone else\'s post'])
    })

    it('offers each tag name once, whatever its spelling in each project', async () => {
      const names = (await calendar(owner, {})).tags.map(t => t.name.toLowerCase())
      expect(names.filter(n => n === 'redaktionsplan')).toHaveLength(1)
    })

    it('moves a card to its new day, and drops it when the tag goes', async () => {
      await send(owner, `/api/cards/${subtaskB}`, 'PUT', { dueDate: '2026-11-28' })
      expect((await calendar(owner, { tags: 'Redaktionsplan' })).cards.find(card => card.id === subtaskB)!.dueDate?.slice(0, 10)).toBe('2026-11-28')
      await setCardTags(owner, postA, [])
      expect(ids((await calendar(owner, { tags: 'Redaktionsplan' })).cards)).not.toContain(postA)
    })

    it('needs a window of real days, at most 62 days long', async () => {
      const get = (query: string) => fetch(url(`/api/calendar?${query}`), { headers: owner.headers })
      expect((await get('from=2026-11-23')).status).toBe(400)
      expect((await get('from=2026-11-29&to=2026-11-23')).status).toBe(400)
      expect((await get('from=2026-01-01&to=2026-06-01')).status).toBe(400)
      expect((await get('from=23.11.2026&to=29.11.2026')).status).toBe(400)
    })
  })

  describe('saved calendars', () => {
    const filters = { mode: 'week', tags: ['Redaktionsplan'], people: [], projects: [], statuses: [] }

    it('saves, lists, renames and deletes the caller\'s own calendars', async () => {
      const res = await send(owner, '/api/calendars', 'POST', { name: 'Redaktionskalender', filters })
      expect(res.status).toBe(201)
      const saved = await res.json() as { id: string, name: string, filters: typeof filters }
      expect(saved.filters).toEqual(filters)

      const list = await $fetch('/api/calendars', { headers: owner.headers }) as Array<{ id: string }>
      expect(list.map(cal => cal.id)).toContain(saved.id)

      const renamed = await (await send(owner, `/api/calendars/${saved.id}`, 'PUT', { name: 'Content', filters: { ...filters, mode: 'month' } })).json() as { name: string, filters: { mode: string } }
      expect(renamed.name).toBe('Content')
      expect(renamed.filters.mode).toBe('month')

      expect((await send(owner, `/api/calendars/${saved.id}`, 'DELETE')).status).toBe(200)
      expect(((await $fetch('/api/calendars', { headers: owner.headers })) as Array<{ id: string }>).map(cal => cal.id)).not.toContain(saved.id)
    })

    it('keeps each person\'s calendars their own', async () => {
      const saved = await (await send(owner, '/api/calendars', 'POST', { name: 'Mine', filters })).json() as { id: string }
      expect((await $fetch('/api/calendars', { headers: colleague.headers }) as Array<{ id: string }>).map(cal => cal.id)).not.toContain(saved.id)
      expect((await send(colleague, `/api/calendars/${saved.id}`, 'PUT', { name: 'Taken' })).status).toBe(404)
      expect((await send(colleague, `/api/calendars/${saved.id}`, 'DELETE')).status).toBe(404)
    })

    it('refuses a calendar without a name, or with filters of the wrong shape', async () => {
      expect((await send(owner, '/api/calendars', 'POST', { name: ' ', filters })).status).toBe(400)
      expect((await send(owner, '/api/calendars', 'POST', { name: 'Bad', filters: { ...filters, mode: 'year' } })).status).toBe(400)
      expect((await send(owner, '/api/calendars', 'POST', { name: 'Bad', filters: { ...filters, tags: 'Redaktionsplan' } })).status).toBe(400)
    })
  })
})
