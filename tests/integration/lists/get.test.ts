import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestList, createTestCard, getList } from '../../setup/fixtures'

describe('GET /api/lists/:id', async () => {
  let user: TestUser
  let otherUser: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
    otherUser = await registerTestUser()
  })

  it('returns list by ID with all project cards', async () => {
    const project = await createTestProject(user, { name: `List Get ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await $fetch(`/api/boards/${board.id}`, { headers: user.headers }) as Record<string, unknown>
    const statusId = fullBoard.columns[0].id

    await createTestCard(user, board.id, statusId, { title: 'Card A' })
    await createTestCard(user, board.id, statusId, { title: 'Card B' })

    const list = await createTestList(user, project.id, { name: 'All View' })
    const fullList = await getList(user, list.id)

    expect(fullList.id).toBe(list.id)
    expect(fullList.name).toBe('All View')
    expect(fullList.cards.length).toBeGreaterThanOrEqual(2)
    expect(fullList.cards.find((c: Record<string, unknown>) => c.title === 'Card A')).toBeTruthy()
    expect(fullList.cards.find((c: Record<string, unknown>) => c.title === 'Card B')).toBeTruthy()
    // Each card should have a status object
    for (const card of fullList.cards) {
      expect(card.status).toBeTruthy()
      expect(card.status!.id).toBeTruthy()
      expect(card.status!.name).toBeTruthy()
    }
  })

  it('returns list by slug with projectSlug scoping', async () => {
    const project = await createTestProject(user, { name: `List Slug Get ${Date.now()}` })
    const list = await createTestList(user, project.id, { name: 'Scoped', slug: 'scoped' })

    const fullList = await getList(user, 'scoped', { projectSlug: project.slug })
    expect(fullList.id).toBe(list.id)
  })

  it('includes columns, statuses, members, and tags', async () => {
    const project = await createTestProject(user, { name: `List Full ${Date.now()}` })
    const list = await createTestList(user, project.id)

    const fullList = await getList(user, list.id)
    expect(fullList.columns.length).toBeGreaterThanOrEqual(1)
    expect(fullList.statuses.length).toBeGreaterThanOrEqual(1)
    expect(fullList.members.length).toBeGreaterThanOrEqual(1)
    expect(fullList.project).toBeTruthy()
    expect(fullList.project.key).toBeTruthy()
  })

  it('returns 404 for non-members', async () => {
    const project = await createTestProject(user, { name: `List NM ${Date.now()}` })
    const list = await createTestList(user, project.id)

    const res = await fetch(url(`/api/lists/${list.id}`), {
      headers: otherUser.headers
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-existent list', async () => {
    const res = await fetch(url('/api/lists/nonexistent'), {
      headers: user.headers
    })
    expect(res.status).toBe(404)
  })

  it('includes card tags in response', async () => {
    const project = await createTestProject(user, { name: `List Tags ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await $fetch(`/api/boards/${board.id}`, { headers: user.headers }) as Record<string, unknown>
    const statusId = fullBoard.columns[0].id

    const card = await createTestCard(user, board.id, statusId, { title: 'Tagged Card' })

    // Create a tag and assign it
    const tag = await $fetch(`/api/projects/${project.id}/tags`, {
      method: 'POST',
      body: { name: 'Bug', color: '#ef4444' },
      headers: user.headers
    }) as Record<string, unknown>
    await $fetch(`/api/cards/${card.id}/tags`, {
      method: 'PUT',
      body: { tagIds: [tag.id] },
      headers: user.headers
    })

    const list = await createTestList(user, project.id)
    const fullList = await getList(user, list.id)

    const taggedCard = fullList.cards.find((c: Record<string, unknown>) => c.id === card.id)
    expect(taggedCard).toBeTruthy()
    expect(taggedCard!.tags).toHaveLength(1)
    expect(taggedCard!.tags[0].name).toBe('Bug')
  })
})
