import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../../setup/fixtures'

describe('POST /api/boards/:id/cards', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates a card with correct position and projectId', async () => {
    const project = await createTestProject(user, { name: `Card Create ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]

    const card = await createTestCard(user, board.id, col.id, {
      title: 'Test Card',
      description: 'A description',
      priority: 'high'
    })

    expect(card.title).toBe('Test Card')
    expect(card.projectId).toBe(project.id)
    expect(card.statusId).toBe(col.id)
    expect(card.position).toBe(0)
    expect(card.priority).toBe('high')
  })

  it('auto-increments position for new cards in same status', async () => {
    const project = await createTestProject(user, { name: `Card Position ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]

    const card1 = await createTestCard(user, board.id, col.id, { title: 'Card 1' })
    const card2 = await createTestCard(user, board.id, col.id, { title: 'Card 2' })
    const card3 = await createTestCard(user, board.id, col.id, { title: 'Card 3' })

    expect(card1.position).toBe(0)
    expect(card2.position).toBe(1)
    expect(card3.position).toBe(2)
  })

  it('defaults priority to medium', async () => {
    const project = await createTestProject(user, { name: `Card Default ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]

    const card = await createTestCard(user, board.id, col.id, { title: 'Default Priority' })
    expect(card.priority).toBe('medium')
  })

  it('rejects missing required fields', async () => {
    const project = await createTestProject(user, { name: `Card Validate ${Date.now()}` })
    const board = await createTestBoard(user, project.id)

    await expectError($fetch(`/api/boards/${board.id}/cards`, {
      method: 'POST',
      body: { title: 'No Status' },
      headers: user.headers
    }), 400)
  })

  it('sets createdById to the current user', async () => {
    const project = await createTestProject(user, { name: `Card Creator ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]

    const card = await $fetch(`/api/boards/${board.id}/cards`, {
      method: 'POST',
      body: { statusId: col.id, title: 'Creator Test', assigneeId: user.id },
      headers: user.headers
    }) as Record<string, unknown>

    expect(card.createdById).toBe(user.id)
  })
})
