import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../../setup/fixtures'

describe('PUT /api/cards/:id/move', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('moves card within the same status (reorder)', async () => {
    const project = await createTestProject(user, { name: `Move Within ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]

    const _card1 = await createTestCard(user, board.id, col.id, { title: 'First' })
    const _card2 = await createTestCard(user, board.id, col.id, { title: 'Second' })
    const card3 = await createTestCard(user, board.id, col.id, { title: 'Third' })

    await $fetch(`/api/cards/${card3.id}/move`, {
      method: 'PUT',
      body: { statusId: col.id, position: 0 },
      headers: user.headers
    })

    const updated = await getBoard(user, board.id)
    const colCards = updated.cards
      .filter(c => c.statusId === col.id)
      .sort((a, b) => a.position - b.position)

    expect(colCards[0].title).toBe('Third')
    expect(colCards[1].title).toBe('First')
    expect(colCards[2].title).toBe('Second')
    expect(colCards.map(c => c.position)).toEqual([0, 1, 2])
  })

  it('moves card across statuses', async () => {
    const project = await createTestProject(user, { name: `Move Across ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const sourceCol = fullBoard.columns[0]
    const targetCol = fullBoard.columns[1]

    const _card1 = await createTestCard(user, board.id, sourceCol.id, { title: 'Stay' })
    const card2 = await createTestCard(user, board.id, sourceCol.id, { title: 'Move Me' })

    await $fetch(`/api/cards/${card2.id}/move`, {
      method: 'PUT',
      body: { statusId: targetCol.id, position: 0 },
      headers: user.headers
    })

    const updated = await getBoard(user, board.id)

    const sourceCards = updated.cards.filter(c => c.statusId === sourceCol.id)
    expect(sourceCards).toHaveLength(1)
    expect(sourceCards[0].title).toBe('Stay')
    expect(sourceCards[0].position).toBe(0)

    const targetCards = updated.cards.filter(c => c.statusId === targetCol.id)
    expect(targetCards).toHaveLength(1)
    expect(targetCards[0].title).toBe('Move Me')
    expect(targetCards[0].position).toBe(0)
  })

  it('renumbers positions with no gaps after move', async () => {
    const project = await createTestProject(user, { name: `No Gaps ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]
    const targetCol = fullBoard.columns[2]

    const cards = []
    for (let i = 0; i < 4; i++) {
      cards.push(await createTestCard(user, board.id, col.id, { title: `Card ${i}` }))
    }

    await $fetch(`/api/cards/${cards[1].id}/move`, {
      method: 'PUT',
      body: { statusId: targetCol.id, position: 0 },
      headers: user.headers
    })

    const updated = await getBoard(user, board.id)

    const sourceCards = updated.cards
      .filter(c => c.statusId === col.id)
      .sort((a, b) => a.position - b.position)
    expect(sourceCards).toHaveLength(3)
    expect(sourceCards.map(c => c.position)).toEqual([0, 1, 2])

    const targetCards = updated.cards.filter(c => c.statusId === targetCol.id)
    expect(targetCards).toHaveLength(1)
    expect(targetCards[0].position).toBe(0)
  })

  it('inserts at specific position in target status', async () => {
    const project = await createTestProject(user, { name: `Insert At ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col1 = fullBoard.columns[0]
    const col2 = fullBoard.columns[1]

    const _targetA = await createTestCard(user, board.id, col2.id, { title: 'Target A' })
    const _targetB = await createTestCard(user, board.id, col2.id, { title: 'Target B' })
    const mover = await createTestCard(user, board.id, col1.id, { title: 'Inserted' })

    await $fetch(`/api/cards/${mover.id}/move`, {
      method: 'PUT',
      body: { statusId: col2.id, position: 1 },
      headers: user.headers
    })

    const updated = await getBoard(user, board.id)
    const col2Cards = updated.cards
      .filter(c => c.statusId === col2.id)
      .sort((a, b) => a.position - b.position)

    expect(col2Cards).toHaveLength(3)
    expect(col2Cards[0].title).toBe('Target A')
    expect(col2Cards[1].title).toBe('Inserted')
    expect(col2Cards[2].title).toBe('Target B')
    expect(col2Cards.map(c => c.position)).toEqual([0, 1, 2])
  })

  it('rejects missing fields', async () => {
    const project = await createTestProject(user, { name: `Move Validation ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)
    const col = fullBoard.columns[0]
    const card = await createTestCard(user, board.id, col.id)

    await expectError($fetch(`/api/cards/${card.id}/move`, {
      method: 'PUT',
      body: { statusId: col.id },
      headers: user.headers
    }), 400)
  })
})
