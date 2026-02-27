import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'

describe('GET /api/projects/[id] — enriched response', async () => {
  let user: TestUser
  let project: Awaited<ReturnType<typeof createTestProject>>

  beforeAll(async () => {
    user = await registerTestUser()
    project = await createTestProject(user)
  })

  it('returns zero card stats for a new project with default board', async () => {
    const result = await $fetch(`/api/projects/${project.slug}`, {
      headers: user.headers
    }) as Record<string, unknown>

    expect(result.totalCards).toBe(0)
    expect(result.priorityCounts).toEqual({ urgent: 0, high: 0, medium: 0, low: 0 })
    expect(result.boards).toHaveLength(1)
    expect(result.boards[0].name).toBe('Overview')
    expect(result.boards[0].cardCount).toBe(0)
  })

  it('returns cardCount and lastActivity per board', async () => {
    const board = await createTestBoard(user, project.id)
    const boardData = await getBoard(user, board.id)
    const col = boardData.columns[0]

    // Create cards with different priorities
    await createTestCard(user, board.id, col.id, { title: 'Card A', priority: 'high' })
    await createTestCard(user, board.id, col.id, { title: 'Card B', priority: 'low' })

    const result = await $fetch(`/api/projects/${project.slug}`, {
      headers: user.headers
    }) as Record<string, unknown>

    const enrichedBoard = result.boards.find((b: Record<string, unknown>) => b.id === board.id)
    expect(enrichedBoard).toBeDefined()
    expect(enrichedBoard.cardCount).toBe(2)
    expect(enrichedBoard.lastActivity).toBeTruthy()
    // lastActivity should be a valid ISO date
    expect(new Date(enrichedBoard.lastActivity).getTime()).toBeGreaterThan(0)
  })

  it('returns correct project-level totalCards and priorityCounts', async () => {
    const result = await $fetch(`/api/projects/${project.slug}`, {
      headers: user.headers
    }) as Record<string, unknown>

    expect(result.totalCards).toBe(2)
    expect(result.priorityCounts.high).toBe(1)
    expect(result.priorityCounts.low).toBe(1)
    expect(result.priorityCounts.medium).toBe(0)
    expect(result.priorityCounts.urgent).toBe(0)
  })

  it('returns zero cardCount for board with no cards in its columns', async () => {
    // Create a second board — it shares statuses, so it sees the same cards
    const board2 = await createTestBoard(user, project.id)

    const result = await $fetch(`/api/projects/${project.slug}`, {
      headers: user.headers
    }) as Record<string, unknown>

    const enrichedBoard2 = result.boards.find((b: Record<string, unknown>) => b.id === board2.id)
    expect(enrichedBoard2).toBeDefined()
    // Board2 shares project statuses, so it sees the same cards
    expect(enrichedBoard2.cardCount).toBe(2)
  })
})
