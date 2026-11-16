import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestComment } from '../../setup/fixtures'

/**
 * Request schemas for the card-side endpoints: comments, tags, duplicate, the AI
 * endpoints and OAuth consent. Each body is refused with a 400 before the handler
 * acts on it; the AI cases are all refused before any model is called.
 */

async function send(user: TestUser, method: string, path: string, body?: unknown) {
  const res = await fetch(url(path), {
    method,
    headers: { ...user.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, message: (await res.json().catch(() => ({}))).message as string | undefined }
}

describe('card-side request validation', () => {
  let user: TestUser
  let projectId: string
  let projectSlug: string
  let statusId: string

  beforeAll(async () => {
    user = await registerTestUser()
    const project = await createTestProject(user)
    projectId = project.id
    projectSlug = project.slug
    const detail = await $fetch<{ statuses: Array<{ id: string }> }>(`/api/projects/${projectId}`, { headers: user.headers })
    statusId = detail.statuses[0]!.id
  })

  it('refuses a comment body that is not text or is blank, on create and edit', async () => {
    const card = await createTestCard(user, projectId, statusId)
    expect(await send(user, 'POST', `/api/cards/${card.id}/comments`, { body: 42 })).toEqual({ status: 400, message: 'Comment body is required' })
    expect(await send(user, 'POST', `/api/cards/${card.id}/comments`, { body: '   ' })).toEqual({ status: 400, message: 'Comment body is required' })
    expect((await send(user, 'POST', `/api/cards/${card.id}/comments`)).status).toBe(400)

    const comment = await createTestComment(user, card.id)
    expect(await send(user, 'PUT', `/api/comments/${comment.id}`, { body: ['x'] })).toEqual({ status: 400, message: 'Comment body is required' })
    expect((await send(user, 'PUT', `/api/comments/${comment.id}`)).status).toBe(400)
  })

  it('refuses tagIds that are not a list of ids', async () => {
    const card = await createTestCard(user, projectId, statusId)
    expect(await send(user, 'PUT', `/api/cards/${card.id}/tags`, { tagIds: 'abc' })).toEqual({ status: 400, message: 'tagIds must be an array' })
    expect((await send(user, 'PUT', `/api/cards/${card.id}/tags`, { tagIds: [1, 2] })).status).toBe(400)
    expect((await send(user, 'PUT', `/api/cards/${card.id}/tags`)).status).toBe(400)
  })

  it('refuses a duplicate without a title or board, and tagIds that are not a list', async () => {
    const card = await createTestCard(user, projectId, statusId)
    const board = await createTestBoard(user, projectId)
    expect(await send(user, 'POST', `/api/cards/${card.id}/duplicate`, { boardId: board.id })).toEqual({ status: 400, message: 'Title is required' })
    expect(await send(user, 'POST', `/api/cards/${card.id}/duplicate`, { title: 'Copy' })).toEqual({ status: 400, message: 'boardId is required' })
    // A string used to fall back to the board's tag filter without a word.
    expect((await send(user, 'POST', `/api/cards/${card.id}/duplicate`, { title: 'Copy', boardId: board.id, tagIds: 'abc' })).status).toBe(400)
    expect((await send(user, 'POST', `/api/cards/${card.id}/duplicate`)).status).toBe(400)
  })

  it('refuses malformed AI requests before calling a model', async () => {
    const card = await createTestCard(user, projectId, statusId)
    const describe = `/api/projects/${projectSlug}/ai/generate-description`
    expect(await send(user, 'POST', describe, { title: 42 })).toEqual({ status: 400, message: 'Title is required' })
    expect(await send(user, 'POST', describe, { title: 'T', mode: 'rewrite' })).toEqual({ status: 400, message: 'Mode must be "generate" or "improve"' })
    expect((await send(user, 'POST', describe, { title: 'T', tags: 'bug' })).status).toBe(400)
    expect((await send(user, 'POST', describe)).status).toBe(400)

    const comment = `/api/cards/${card.id}/ai/comment`
    expect(await send(user, 'POST', comment, { body: '' })).toEqual({ status: 400, message: 'Comment body is required' })
    expect((await send(user, 'POST', comment, { body: 'Draft', userPrompt: 5 })).status).toBe(400)
    expect((await send(user, 'POST', comment)).status).toBe(400)
  })

  it('refuses a consent body that is not an object, or a decision other than allow or deny', async () => {
    expect((await send(user, 'POST', '/api/oauth/authorize')).status).toBe(400)
    expect(await send(user, 'POST', '/api/oauth/authorize', { decision: 'yes' })).toEqual({ status: 400, message: 'decision must be "allow" or "deny"' })
  })
})
