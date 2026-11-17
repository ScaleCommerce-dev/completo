import { describe, it, expect, beforeAll } from 'vitest'
import { url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestTag, getBoard, setCardTags, addProjectMember } from '../../setup/fixtures'

describe('PUT /api/cards/:id/tags', async () => {
  let owner: TestUser
  let member: TestUser
  let nonMember: TestUser
  let projectId: string
  let boardId: string
  let statusId: string
  let tag1: { id: string, name: string, color: string }
  let tag2: { id: string, name: string, color: string }

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    nonMember = await registerTestUser()

    const project = await createTestProject(owner)
    projectId = project.id

    // Add member
    await addProjectMember(owner, projectId, { userId: member.id })

    const board = await createTestBoard(owner, projectId)
    boardId = board.id

    const boardData = await getBoard(owner, boardId)
    statusId = boardData.columns[0].id

    tag1 = await createTestTag(owner, projectId, { name: 'Bug' })
    tag2 = await createTestTag(owner, projectId, { name: 'Feature' })
  })

  it('sets tags on a card', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    const result = await setCardTags(owner, card.id, [tag1.id])

    expect(result.tags).toHaveLength(1)
    expect(result.tags[0].name).toBe('Bug')
  })

  it('replaces existing tags', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    await setCardTags(owner, card.id, [tag1.id])
    const result = await setCardTags(owner, card.id, [tag2.id])

    expect(result.tags).toHaveLength(1)
    expect(result.tags[0].name).toBe('Feature')
  })

  it('sets multiple tags', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    const result = await setCardTags(owner, card.id, [tag1.id, tag2.id])

    expect(result.tags).toHaveLength(2)
  })

  it('treats a repeated tag id as one tag', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    await setCardTags(owner, card.id, [tag1.id, tag1.id])

    const board = await getBoard(owner, boardId)
    const onBoard = board.cards.find((c: { id: number }) => c.id === card.id)
    expect(onBoard.tags.map((t: { id: string }) => t.id)).toEqual([tag1.id])
  })

  it('clears all tags with empty array', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    await setCardTags(owner, card.id, [tag1.id])
    const result = await setCardTags(owner, card.id, [])

    expect(result.tags).toHaveLength(0)
  })

  it('allows any project member to set tags', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    const result = await setCardTags(member, card.id, [tag1.id])

    expect(result.tags).toHaveLength(1)
  })

  it('rejects tags from another project', async () => {
    const project2 = await createTestProject(owner)
    const otherTag = await createTestTag(owner, project2.id, { name: 'Other' })
    const card = await createTestCard(owner, projectId, statusId)

    const res = await fetch(url(`/api/cards/${card.id}/tags`), {
      method: 'PUT',
      body: JSON.stringify({ tagIds: [otherTag.id] }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })

  it('rejects non-member', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    const res = await fetch(url(`/api/cards/${card.id}/tags`), {
      method: 'PUT',
      body: JSON.stringify({ tagIds: [tag1.id] }),
      headers: { ...nonMember.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-existent card', async () => {
    const res = await fetch(url('/api/cards/999999/tags'), {
      method: 'PUT',
      body: JSON.stringify({ tagIds: [tag1.id] }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid tagIds format', async () => {
    const card = await createTestCard(owner, projectId, statusId)
    const res = await fetch(url(`/api/cards/${card.id}/tags`), {
      method: 'PUT',
      body: JSON.stringify({ tagIds: 'not-an-array' }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })
})
