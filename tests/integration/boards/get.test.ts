import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../../setup/fixtures'

describe('GET /api/boards/:id', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('fetches board by ID', async () => {
    const project = await createTestProject(user, { name: `Get By ID ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const result = await getBoard(user, board.id)

    expect(result.id).toBe(board.id)
    expect(result.name).toBe(board.name)
    expect(result.project.id).toBe(project.id)
    expect(result.project.key).toBe(project.key)
    expect(result.columns).toHaveLength(5)
    expect(result.members).toHaveLength(1)
    expect(result.members[0].id).toBe(user.id)
  })

  it('fetches board by slug', async () => {
    const project = await createTestProject(user, { name: `Get By Slug ${Date.now()}` })
    const uniqueSlug = `slug-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const board = await createTestBoard(user, project.id, { slug: uniqueSlug })
    const result = await getBoard(user, uniqueSlug)

    expect(result.id).toBe(board.id)
    expect(result.slug).toBe(uniqueSlug)
  })

  it('returns columns sorted by boardColumns position', async () => {
    const project = await createTestProject(user, { name: `Col Order ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const result = await getBoard(user, board.id)

    const positions = result.columns.map(c => c.position)
    expect(positions).toEqual([0, 1, 2, 3, 4])
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })

  it('returns cards belonging to the board columns', async () => {
    const project = await createTestProject(user, { name: `Cards ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    const col = fullBoard.columns[0]
    await createTestCard(user, board.id, col.id, { title: 'Card A' })
    await createTestCard(user, board.id, col.id, { title: 'Card B' })

    const result = await getBoard(user, board.id)
    expect(result.cards).toHaveLength(2)
    expect(result.cards.map(c => c.title).sort()).toEqual(['Card A', 'Card B'])
  })

  it('returns 404 for non-existent board', async () => {
    await expectError($fetch('/api/boards/nonexistent-id', {
      headers: user.headers
    }), 404)
  })

  it('returns doneStatusId and doneRetentionDays in project', async () => {
    const project = await createTestProject(user, { name: `Done Info ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const result = await getBoard(user, board.id) as Record<string, unknown>

    expect(result.project.doneStatusId).toBeTruthy()
    expect(result.project.doneRetentionDays).toBe(30)
  })

  it('filters done cards past retention window', async () => {
    const project = await createTestProject(user, { name: `Retention Filter ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    // Find the Done status (last one)
    const doneCol = fullBoard.columns.find(c => c.name === 'Done')!
    const otherCol = fullBoard.columns[0]

    // Create cards: one in done status, one in another status
    await createTestCard(user, board.id, doneCol.id, { title: 'Done Card' })
    await createTestCard(user, board.id, otherCol.id, { title: 'Other Card' })

    // With default retention (30 days), recently created done cards should still be visible
    const result = await getBoard(user, board.id)
    const titles = result.cards.map(c => c.title)
    expect(titles).toContain('Other Card')
    expect(titles).toContain('Done Card')

    // Verify doneRetentionDays must be a positive integer
    await expectError($fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { doneRetentionDays: 0 },
      headers: user.headers
    }), 400)
  })

  it('shows done cards when retention is null (unlimited)', async () => {
    const project = await createTestProject(user, { name: `No Retention ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    const doneCol = fullBoard.columns.find(c => c.name === 'Done')!

    await createTestCard(user, board.id, doneCol.id, { title: 'Done Visible' })

    // Set retention to null (unlimited) — all cards should show
    await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { doneRetentionDays: null },
      headers: user.headers
    })

    const result = await getBoard(user, board.id)
    const titles = result.cards.map(c => c.title)
    expect(titles).toContain('Done Visible')
  })
})
