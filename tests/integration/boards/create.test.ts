import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, getBoard } from '../../setup/fixtures'

describe('POST /api/projects/:id/boards', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates a board that reuses project statuses from default board', async () => {
    const project = await createTestProject(user, { name: `Board Create ${Date.now()}` })
    const board = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'Sprint 1' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(board.name).toBe('Sprint 1')
    expect(board.slug).toBe('sprint-1')
    expect(board.projectId).toBe(project.id)
    expect(board.position).toBe(1) // default "Kanban" board is position 0

    const fullBoard = await getBoard(user, board.id)
    expect(fullBoard.columns).toHaveLength(5)
    expect(fullBoard.columns.map((c: Record<string, unknown>) => c.name)).toEqual(['Backlog', 'To Do', 'In Progress', 'Review', 'Done'])
    expect(fullBoard.columns.map((c: Record<string, unknown>) => c.color)).toEqual(['#a1a1aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'])
    expect(fullBoard.columns.map((c: Record<string, unknown>) => c.position)).toEqual([0, 1, 2, 3, 4])
  })

  it('second board reuses existing project statuses', async () => {
    const project = await createTestProject(user, { name: `Reuse Cols ${Date.now()}` })

    const board1 = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'Board One' },
      headers: user.headers
    }) as Record<string, unknown>

    const board2 = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'Board Two' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(board2.position).toBe(2) // default "Kanban" board is position 0

    const full1 = await getBoard(user, board1.id)
    const full2 = await getBoard(user, board2.id)

    const ids1 = full1.columns.map((c: Record<string, unknown>) => c.id).sort()
    const ids2 = full2.columns.map((c: Record<string, unknown>) => c.id).sort()
    expect(ids1).toEqual(ids2)
  })

  it('inherits column positions from existing board', async () => {
    const project = await createTestProject(user, { name: `Inherit Pos ${Date.now()}` })

    const board1 = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'First Board' },
      headers: user.headers
    }) as Record<string, unknown>

    const full1 = await getBoard(user, board1.id)

    const reordered = full1.columns.map((c: Record<string, unknown>, i: number) => ({
      id: c.id,
      position: full1.columns.length - 1 - i
    }))
    await $fetch(`/api/boards/${board1.id}/columns/reorder`, {
      method: 'PUT',
      body: { columns: reordered },
      headers: user.headers
    })

    const board2 = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'Second Board' },
      headers: user.headers
    }) as Record<string, unknown>

    const full2 = await getBoard(user, board2.id)
    const full1After = await getBoard(user, board1.id)

    expect(full2.columns.map((c: Record<string, unknown>) => c.position).sort())
      .toEqual(full1After.columns.map((c: Record<string, unknown>) => c.position).sort())
  })

  it('auto-generates slug from name', async () => {
    const project = await createTestProject(user, { name: `Slug Gen ${Date.now()}` })
    const board = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'My Sprint Board' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(board.slug).toBe('my-sprint-board')
  })

  it('handles slug collision by appending suffix', async () => {
    const project = await createTestProject(user, { name: `Slug Collision ${Date.now()}` })

    const board1 = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'Sprint', slug: 'sprint' },
      headers: user.headers
    }) as Record<string, unknown>

    const board2 = await $fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: { name: 'Sprint', slug: 'sprint' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(board1.slug).toBe('sprint')
    expect(board2.slug).toMatch(/^sprint-[a-z0-9]{4}$/)
    expect(board2.slug).not.toBe(board1.slug)
  })

  it('rejects missing name', async () => {
    const project = await createTestProject(user, { name: `No Name ${Date.now()}` })
    await expectError($fetch(`/api/projects/${project.id}/boards`, {
      method: 'POST',
      body: {},
      headers: user.headers
    }), 400)
  })
})
