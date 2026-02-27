import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestTag, getBoard, setCardTags } from '../../setup/fixtures'

describe('Board/card GET includes tags', async () => {
  let owner: TestUser
  let projectId: string
  let boardId: string
  let statusId: string
  let tag1: { id: string; name: string; color: string }
  let tag2: { id: string; name: string; color: string }

  beforeAll(async () => {
    owner = await registerTestUser()
    const project = await createTestProject(owner)
    projectId = project.id

    const board = await createTestBoard(owner, projectId)
    boardId = board.id

    const boardData = await getBoard(owner, boardId)
    statusId = boardData.columns[0].id

    tag1 = await createTestTag(owner, projectId, { name: 'TagA', color: '#ef4444' })
    tag2 = await createTestTag(owner, projectId, { name: 'TagB', color: '#3b82f6' })
  })

  it('includes tags array on each card in board response', async () => {
    const card = await createTestCard(owner, boardId, statusId)
    await setCardTags(owner, card.id, [tag1.id, tag2.id])

    const boardData = await getBoard(owner, boardId) as any
    const boardCard = boardData.cards.find((c: any) => c.id === card.id)

    expect(boardCard).toBeDefined()
    expect(boardCard.tags).toHaveLength(2)
    expect(boardCard.tags.map((t: any) => t.name).sort()).toEqual(['TagA', 'TagB'])
  })

  it('includes project tags in board response', async () => {
    const boardData = await $fetch(`/api/boards/${boardId}`, {
      headers: owner.headers
    }) as any

    expect(boardData.tags).toBeDefined()
    expect(boardData.tags.length).toBeGreaterThanOrEqual(2)
    expect(boardData.tags[0]).toHaveProperty('id')
    expect(boardData.tags[0]).toHaveProperty('name')
    expect(boardData.tags[0]).toHaveProperty('color')
  })

  it('card with no tags has empty tags array', async () => {
    const card = await createTestCard(owner, boardId, statusId)
    const boardData = await getBoard(owner, boardId) as any
    const boardCard = boardData.cards.find((c: any) => c.id === card.id)

    expect(boardCard).toBeDefined()
    expect(boardCard.tags).toEqual([])
  })

  it('includes tags in single card GET response', async () => {
    const card = await createTestCard(owner, boardId, statusId)
    await setCardTags(owner, card.id, [tag1.id])

    const cardData = await $fetch(`/api/cards/${card.id}`, {
      headers: owner.headers
    }) as any

    expect(cardData.tags).toHaveLength(1)
    expect(cardData.tags[0].name).toBe('TagA')
    expect(cardData.projectTags).toBeDefined()
    expect(cardData.projectTags.length).toBeGreaterThanOrEqual(2)
  })

  it('cascade-deletes cardTags when tag deleted', async () => {
    const tempTag = await createTestTag(owner, projectId, { name: 'Temp' })
    const card = await createTestCard(owner, boardId, statusId)
    await setCardTags(owner, card.id, [tempTag.id])

    // Delete the tag
    await $fetch(`/api/tags/${tempTag.id}`, {
      method: 'DELETE',
      headers: owner.headers
    })

    // Card should have no tags
    const cardData = await $fetch(`/api/cards/${card.id}`, {
      headers: owner.headers
    }) as any
    expect(cardData.tags).toHaveLength(0)
  })
})
