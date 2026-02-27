import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard } from '../../setup/fixtures'

describe('PUT /api/boards/:id/columns/reorder', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('reorders columns for a specific board', async () => {
    const project = await createTestProject(user, { name: `Reorder ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    const reversed = fullBoard.columns.map((c, i) => ({
      id: c.id,
      position: fullBoard.columns.length - 1 - i
    }))

    await $fetch(`/api/boards/${board.id}/columns/reorder`, {
      method: 'PUT',
      body: { columns: reversed },
      headers: user.headers
    })

    const updated = await getBoard(user, board.id)
    expect(updated.columns[0].name).toBe('Done')
    expect(updated.columns[4].name).toBe('Backlog')
  })

  it('does not affect other boards in the same project', async () => {
    const project = await createTestProject(user, { name: `Reorder Isolation ${Date.now()}` })
    const board1 = await createTestBoard(user, project.id, { name: 'Board 1' })
    const board2 = await createTestBoard(user, project.id, { name: 'Board 2' })

    const full1 = await getBoard(user, board1.id)
    const originalOrder = full1.columns.map(c => c.name)

    const reversed = full1.columns.map((c, i) => ({
      id: c.id,
      position: full1.columns.length - 1 - i
    }))

    await $fetch(`/api/boards/${board1.id}/columns/reorder`, {
      method: 'PUT',
      body: { columns: reversed },
      headers: user.headers
    })

    const full2 = await getBoard(user, board2.id)
    expect(full2.columns.map(c => c.name)).toEqual(originalOrder)
  })

  it('rejects empty columns array', async () => {
    const project = await createTestProject(user, { name: `Reorder Empty ${Date.now()}` })
    const board = await createTestBoard(user, project.id)

    await expectError($fetch(`/api/boards/${board.id}/columns/reorder`, {
      method: 'PUT',
      body: { columns: [] },
      headers: user.headers
    }), 400)
  })
})
