import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../../setup/fixtures'

describe('Card due date', async () => {
  let user: TestUser
  let boardId: string
  let colId: string

  beforeAll(async () => {
    user = await registerTestUser()
    const project = await createTestProject(user, { name: `DueDate ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    boardId = board.id
    colId = fullBoard.columns[0].id
  })

  it('creates a card with a due date', async () => {
    const card = await createTestCard(user, boardId, colId, {
      title: 'With Due Date',
      dueDate: '2026-04-01'
    })
    expect(card.dueDate).toBeTruthy()
  })

  it('creates a card without a due date (null)', async () => {
    const card = await createTestCard(user, boardId, colId, {
      title: 'No Due Date'
    })
    expect(card.dueDate).toBeNull()
  })

  it('updates card due date', async () => {
    const card = await createTestCard(user, boardId, colId, { title: 'Update Due' })
    const updated = await $fetch(`/api/cards/${card.id}`, {
      method: 'PUT',
      body: { dueDate: '2026-05-15' },
      headers: user.headers
    }) as any
    expect(updated.dueDate).toBeTruthy()
  })

  it('clears card due date with null', async () => {
    const card = await createTestCard(user, boardId, colId, {
      title: 'Clear Due',
      dueDate: '2026-06-01'
    })
    expect(card.dueDate).toBeTruthy()

    const updated = await $fetch(`/api/cards/${card.id}`, {
      method: 'PUT',
      body: { dueDate: null },
      headers: user.headers
    }) as any
    expect(updated.dueDate).toBeNull()
  })

  it('returns dueDate in card detail', async () => {
    const card = await createTestCard(user, boardId, colId, {
      title: 'Detail Due',
      dueDate: '2026-07-20'
    })
    const detail = await $fetch(`/api/cards/${card.id}`, {
      headers: user.headers
    }) as any
    expect(detail.dueDate).toBeTruthy()
  })
})
