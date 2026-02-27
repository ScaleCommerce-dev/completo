import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard } from '../../setup/fixtures'

describe('POST /api/boards/:id/columns', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates a status and links only to the requesting board', async () => {
    const project = await createTestProject(user, { name: `Col Board Link ${Date.now()}` })
    const board1 = await createTestBoard(user, project.id, { name: 'Board Alpha' })
    const board2 = await createTestBoard(user, project.id, { name: 'Board Beta' })

    const full1Before = await getBoard(user, board1.id)
    const full2Before = await getBoard(user, board2.id)
    expect(full1Before.columns).toHaveLength(5)
    expect(full2Before.columns).toHaveLength(5)

    const newCol = await $fetch(`/api/boards/${board1.id}/columns`, {
      method: 'POST',
      body: { name: 'Custom Status', color: '#ef4444' },
      headers: user.headers
    }) as any

    expect(newCol.name).toBe('Custom Status')
    expect(newCol.color).toBe('#ef4444')

    const full1After = await getBoard(user, board1.id)
    const full2After = await getBoard(user, board2.id)
    expect(full1After.columns).toHaveLength(6)
    expect(full2After.columns).toHaveLength(5)

    const newColIn1 = full1After.columns.find((c: any) => c.name === 'Custom Status')
    const newColIn2 = full2After.columns.find((c: any) => c.name === 'Custom Status')
    expect(newColIn1).toBeTruthy()
    expect(newColIn2).toBeUndefined()
  })

  it('places new status at the end (highest position)', async () => {
    const project = await createTestProject(user, { name: `Col Position ${Date.now()}` })
    const board = await createTestBoard(user, project.id)

    const newCol = await $fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'Last Status' },
      headers: user.headers
    }) as any

    expect(newCol.position).toBe(5)
  })

  it('rejects missing name', async () => {
    const project = await createTestProject(user, { name: `Col No Name ${Date.now()}` })
    const board = await createTestBoard(user, project.id)

    await expectError($fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: {},
      headers: user.headers
    }), 400)
  })

  it('defaults color to null when not provided', async () => {
    const project = await createTestProject(user, { name: `Col No Color ${Date.now()}` })
    const board = await createTestBoard(user, project.id)

    const newCol = await $fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'No Color Status' },
      headers: user.headers
    }) as any

    expect(newCol.color).toBe('#6366f1')
  })
})
