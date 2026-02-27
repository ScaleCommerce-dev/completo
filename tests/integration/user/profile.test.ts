import { describe, it, expect } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'

describe('GET /api/user/profile', async () => {
  it('returns timestamps for authenticated user', async () => {
    const user = await registerTestUser()

    const result = await $fetch('/api/user/profile', {
      headers: user.headers
    }) as Record<string, unknown>

    expect(result.createdAt).toBeTruthy()
    expect(new Date(result.createdAt).getTime()).toBeGreaterThan(0)
    // lastSeenAt may be null for freshly registered users
    expect('lastSeenAt' in result).toBe(true)
  })

  it('returns priority counts and projects', async () => {
    const user = await registerTestUser()
    const project = await createTestProject(user)
    const board = await createTestBoard(user, project.id)
    const boardData = await getBoard(user, board.id)
    const col = boardData.columns[0]

    // Create cards with different priorities
    await createTestCard(user, board.id, col.id, { title: 'Urgent task', priority: 'urgent', assigneeId: user.id })
    await createTestCard(user, board.id, col.id, { title: 'High task', priority: 'high', assigneeId: user.id })
    await createTestCard(user, board.id, col.id, { title: 'Medium task', priority: 'medium', assigneeId: user.id })

    const result = await $fetch('/api/user/profile', {
      headers: user.headers
    }) as Record<string, unknown>

    expect(result.priorityCounts).toBeDefined()
    expect(result.priorityCounts.urgent).toBe(1)
    expect(result.priorityCounts.high).toBe(1)
    expect(result.priorityCounts.medium).toBe(1)
    expect(result.priorityCounts.low).toBe(0)
    expect(result.totalOpen).toBe(3)
    expect(result.projects).toBeDefined()
    expect(result.projects.length).toBeGreaterThanOrEqual(1)
    const p = result.projects.find((pr: Record<string, unknown>) => pr.id === project.id)
    expect(p).toBeTruthy()
    expect(p.role).toBe('owner')
    expect(p.openCards).toBeGreaterThanOrEqual(3)
  })

  it('excludes done-status cards from priority counts', async () => {
    const user = await registerTestUser()
    const project = await createTestProject(user)
    const board = await createTestBoard(user, project.id)
    const boardData = await getBoard(user, board.id)

    // Find the done status (last column, typically "Done")
    const doneCol = boardData.columns.find(c => c.name === 'Done') || boardData.columns[boardData.columns.length - 1]
    const openCol = boardData.columns[0]

    // Create a card in an open status
    await createTestCard(user, board.id, openCol.id, { title: 'Open card', priority: 'high', assigneeId: user.id })
    // Create a card in the done status
    await createTestCard(user, board.id, doneCol.id, { title: 'Done card', priority: 'high', assigneeId: user.id })

    const result = await $fetch('/api/user/profile', {
      headers: user.headers
    }) as Record<string, unknown>

    // The done card should be excluded - only the open card counted
    expect(result.priorityCounts.high).toBe(1)
    expect(result.totalOpen).toBe(1)
  })

  it('rejects unauthenticated requests', async () => {
    const res = await fetch(url('/api/user/profile'))
    expect(res.status).toBe(401)
  })
})
