import { describe, it, expect, beforeAll } from 'vitest'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard, createTestTag, setCardTags, uploadAttachment } from '../../setup/fixtures'
import { $fetch, url, expectError } from '../../setup/server'

interface CardResult {
  id: number
  title: string
  statusId: string
  projectId: string
  position: number
  priority: string
  dueDate: string | null
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  status: { id: string, name: string, color: string | null } | null
  tags: Array<{ id: string, name: string, color: string }>
  attachmentCount: number
}

async function fetchCards(user: TestUser, projectIdOrSlug: string, params?: Record<string, string>): Promise<CardResult[]> {
  return await $fetch(`/api/projects/${projectIdOrSlug}/cards`, {
    headers: user.headers,
    params
  }) as CardResult[]
}

describe('GET /api/projects/:id/cards', async () => {
  let owner: TestUser
  let member: TestUser
  let nonMember: TestUser
  let project: { id: string, slug: string, key: string }
  let board: { id: string }
  let statusTodo: { id: string, name: string }
  let statusDone: { id: string, name: string }
  let statusBacklog: { id: string, name: string }
  let tag1: { id: string, name: string }
  let _tag2: { id: string, name: string }
  let cardA: { id: number }
  let cardB: { id: number }
  let _cardC: { id: number }
  let cardD: { id: number }

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    nonMember = await registerTestUser()

    project = await createTestProject(owner)

    // Add member
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { userId: member.id },
      headers: owner.headers
    })

    board = await createTestBoard(owner, project.id)
    const fullBoard = await getBoard(owner, board.id)

    // Find statuses (default project has: Backlog, To Do, In Progress, Review, Done)
    statusBacklog = fullBoard.columns.find(c => c.name === 'Backlog')!
    statusTodo = fullBoard.columns.find(c => c.name === 'To Do')!
    statusDone = fullBoard.columns.find(c => c.name === 'Done')!

    // Create tags
    tag1 = await createTestTag(owner, project.id, { name: 'Bug', color: '#ef4444' })
    _tag2 = await createTestTag(owner, project.id, { name: 'Feature', color: '#6366f1' })

    // Card A: To Do, high priority, assigned to owner, due tomorrow, tagged Bug
    cardA = await createTestCard(owner, project.id, statusTodo.id, {
      title: 'Card A',
      priority: 'high',
      assigneeId: owner.id,
      dueDate: '2026-04-01'
    })
    await setCardTags(owner, cardA.id, [tag1.id])

    // Card B: To Do, medium priority, unassigned, due next week, tagged Feature
    cardB = await createTestCard(owner, project.id, statusTodo.id, {
      title: 'Card B',
      priority: 'medium',
      dueDate: '2026-04-10'
    })
    await setCardTags(owner, cardB.id, [_tag2.id])

    // Card C: Backlog, urgent priority, assigned to member
    _cardC = await createTestCard(owner, project.id, statusBacklog.id, {
      title: 'Card C',
      priority: 'urgent',
      assigneeId: member.id
    })

    // Card D: Done status, low priority
    cardD = await createTestCard(owner, project.id, statusDone.id, {
      title: 'Card D',
      priority: 'low'
    })

    // Upload attachment to Card A for enrichment test
    await uploadAttachment(owner, cardA.id)
  })

  it('returns all project cards with enrichment', async () => {
    const cards = await fetchCards(owner, project.id, { includeDone: 'true' })

    expect(cards.length).toBeGreaterThanOrEqual(4)

    // Verify enrichment on Card A
    const a = cards.find(c => c.id === cardA.id)
    expect(a).toBeTruthy()
    expect(a!.status).toBeTruthy()
    expect(a!.status!.name).toBe('To Do')
    expect(a!.assignee).toBeTruthy()
    expect(a!.assignee!.name).toBe(owner.name)
    expect(a!.tags).toHaveLength(1)
    expect(a!.tags[0].name).toBe('Bug')
    expect(a!.attachmentCount).toBe(1)
  })

  it('filters by statusId', async () => {
    const cards = await fetchCards(owner, project.id, { statusId: statusTodo.id })

    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(cards.every(c => c.statusId === statusTodo.id)).toBe(true)
  })

  it('filters by assigneeId', async () => {
    const cards = await fetchCards(owner, project.id, { assigneeId: owner.id })

    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards.every(c => c.assignee?.id === owner.id)).toBe(true)
  })

  it('filters by single priority', async () => {
    const cards = await fetchCards(owner, project.id, { priority: 'urgent' })

    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards.every(c => c.priority === 'urgent')).toBe(true)
  })

  it('filters by comma-separated priorities', async () => {
    const cards = await fetchCards(owner, project.id, { priority: 'high,low', includeDone: 'true' })

    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(cards.every(c => c.priority === 'high' || c.priority === 'low')).toBe(true)
  })

  it('filters by tagId', async () => {
    const cards = await fetchCards(owner, project.id, { tagId: tag1.id })

    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards.every(c => c.tags.some(t => t.id === tag1.id))).toBe(true)
  })

  it('filters by dueBefore', async () => {
    const cards = await fetchCards(owner, project.id, { dueBefore: '2026-04-05' })

    // Card A (due 2026-04-01) should be included, Card B (due 2026-04-10) excluded
    const ids = cards.map(c => c.id)
    expect(ids).toContain(cardA.id)
    expect(ids).not.toContain(cardB.id)
  })

  it('filters by dueAfter', async () => {
    const cards = await fetchCards(owner, project.id, { dueAfter: '2026-04-05' })

    // Card B (due 2026-04-10) should be included, Card A (due 2026-04-01) excluded
    const ids = cards.map(c => c.id)
    expect(ids).toContain(cardB.id)
    expect(ids).not.toContain(cardA.id)
  })

  it('combines multiple filters', async () => {
    const cards = await fetchCards(owner, project.id, { statusId: statusTodo.id, priority: 'high' })

    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards.every(c => c.statusId === statusTodo.id && c.priority === 'high')).toBe(true)
  })

  it('paginates with limit and offset', async () => {
    const page1 = await fetchCards(owner, project.id, { limit: '2', offset: '0', includeDone: 'true' })
    const page2 = await fetchCards(owner, project.id, { limit: '2', offset: '2', includeDone: 'true' })

    expect(page1).toHaveLength(2)
    expect(page2.length).toBeGreaterThanOrEqual(1)

    // No overlap between pages
    const page1Ids = page1.map(c => c.id)
    const page2Ids = page2.map(c => c.id)
    expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false)
  })

  it('sorts by position by default', async () => {
    const cards = await fetchCards(owner, project.id, { statusId: statusTodo.id })

    const positions = cards.map(c => c.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('sorts by priority', async () => {
    const cards = await fetchCards(owner, project.id, { sort: 'priority', order: 'asc', includeDone: 'true' })

    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
    const priorities = cards.map(c => priorityOrder[c.priority] ?? 4)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
  })

  it('sorts desc', async () => {
    const cards = await fetchCards(owner, project.id, { statusId: statusTodo.id, sort: 'position', order: 'desc' })

    const positions = cards.map(c => c.position)
    expect(positions).toEqual([...positions].sort((a, b) => b - a))
  })

  it('excludes expired done cards by default', async () => {
    const cards = await fetchCards(owner, project.id)

    // Card D is in Done status but was just created, so it should still be visible
    const ids = cards.map(c => c.id)
    expect(ids).toContain(cardD.id)
  })

  it('includeDone=true returns all done cards', async () => {
    const cards = await fetchCards(owner, project.id, { includeDone: 'true' })

    const ids = cards.map(c => c.id)
    expect(ids).toContain(cardD.id)
  })

  it('returns 404 for non-members', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/cards`), {
      headers: nonMember.headers
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-existent project', async () => {
    const res = await fetch(url('/api/projects/00000000-0000-0000-0000-000000000000/cards'), {
      headers: owner.headers
    })
    expect(res.status).toBe(404)
  })

  it('caps limit at 200', async () => {
    const cards = await fetchCards(owner, project.id, { limit: '999' })

    // Should not error - limit is capped internally
    expect(Array.isArray(cards)).toBe(true)
  })

  it('rejects invalid sort field', async () => {
    await expectError(
      $fetch(`/api/projects/${project.id}/cards`, {
        headers: owner.headers,
        params: { sort: 'invalid' }
      }),
      400
    )
  })

  it('works for project members', async () => {
    const cards = await fetchCards(member, project.id)

    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThanOrEqual(1)
  })

  it('accepts project by slug', async () => {
    const cards = await fetchCards(owner, project.slug)

    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThanOrEqual(1)
  })
})
