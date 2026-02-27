import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard, uploadAttachment } from '../../setup/fixtures'

describe('Card Attachments', async () => {
  let user: TestUser
  let otherUser: TestUser
  let admin: TestUser
  let projectId: string
  let boardId: string
  let statusId: string
  let cardId: number

  beforeAll(async () => {
    user = await registerTestUser()
    otherUser = await registerTestUser()
    admin = await createAdminUser()

    const project = await createTestProject(user, { name: `Attach ${Date.now()}` })
    projectId = project.id
    const board = await createTestBoard(user, projectId)
    boardId = board.id
    const fullBoard = await getBoard(user, boardId)
    statusId = fullBoard.columns[0].id
    const card = await createTestCard(user, boardId, statusId, { title: 'Attach Card' })
    cardId = card.id
  })

  it('uploads a file to a card', async () => {
    const attachment = await uploadAttachment(user, cardId, {
      filename: 'readme.txt',
      content: 'Hello World'
    })

    expect(attachment.id).toBeDefined()
    expect(attachment.cardId).toBe(cardId)
    expect(attachment.originalName).toBe('readme.txt')
    expect(attachment.mimeType).toBe('text/plain')
    expect(attachment.size).toBe(11)
    expect(attachment.uploadedById).toBe(user.id)
  })

  it('lists attachments for a card', async () => {
    const attachments = await $fetch(`/api/cards/${cardId}/attachments`, {
      headers: user.headers
    })

    expect(Array.isArray(attachments)).toBe(true)
    expect(attachments.length).toBeGreaterThanOrEqual(1)
    expect(attachments[0].originalName).toBe('readme.txt')
  })

  it('downloads an attachment with correct content', async () => {
    const attachments = await $fetch(`/api/cards/${cardId}/attachments`, {
      headers: user.headers
    }) as Record<string, unknown>[]
    const attachmentId = attachments[0].id

    const res = await fetch(url(`/api/attachments/${attachmentId}/download`), {
      headers: user.headers
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain')
    const text = await res.text()
    expect(text).toBe('Hello World')
  })

  it('supports multiple attachments per card', async () => {
    await uploadAttachment(user, cardId, { filename: 'second.txt', content: 'File 2' })

    const attachments = await $fetch(`/api/cards/${cardId}/attachments`, {
      headers: user.headers
    }) as Record<string, unknown>[]

    expect(attachments.length).toBeGreaterThanOrEqual(2)
  })

  it('deletes an attachment', async () => {
    const attachment = await uploadAttachment(user, cardId, {
      filename: 'to-delete.txt',
      content: 'delete me'
    })

    const result = await $fetch(`/api/attachments/${attachment.id}`, {
      method: 'DELETE',
      headers: user.headers
    })
    expect(result).toEqual({ ok: true })

    // Verify it's gone
    const res = await fetch(url(`/api/attachments/${attachment.id}/download`), {
      headers: user.headers
    })
    expect(res.status).toBe(404)
  })

  it('rejects non-member on upload', async () => {
    const res = await fetch(url(`/api/cards/${cardId}/attachments`), {
      method: 'POST',
      body: (() => {
        const fd = new FormData()
        fd.append('file', new Blob(['x'], { type: 'text/plain' }), 'test.txt')
        return fd
      })(),
      headers: otherUser.headers
    })
    expect([403, 404]).toContain(res.status)
  })

  it('rejects non-member on list', async () => {
    const res = await fetch(url(`/api/cards/${cardId}/attachments`), {
      headers: otherUser.headers
    })
    expect([403, 404]).toContain(res.status)
  })

  it('returns 404 for non-member on download', async () => {
    const attachments = await $fetch(`/api/cards/${cardId}/attachments`, {
      headers: user.headers
    }) as Record<string, unknown>[]
    const attachmentId = attachments[0].id

    const res = await fetch(url(`/api/attachments/${attachmentId}/download`), {
      headers: otherUser.headers
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-member on delete', async () => {
    const attachments = await $fetch(`/api/cards/${cardId}/attachments`, {
      headers: user.headers
    }) as Record<string, unknown>[]
    const attachmentId = attachments[0].id

    const res = await fetch(url(`/api/attachments/${attachmentId}`), {
      method: 'DELETE',
      headers: otherUser.headers
    })
    expect(res.status).toBe(404)
  })

  it('admin can access attachments on any project', async () => {
    const attachments = await $fetch(`/api/cards/${cardId}/attachments`, {
      headers: admin.headers
    }) as Record<string, unknown>[]

    expect(attachments.length).toBeGreaterThanOrEqual(1)

    // Admin can also download
    const res = await fetch(url(`/api/attachments/${attachments[0].id}/download`), {
      headers: admin.headers
    })
    expect(res.status).toBe(200)
  })

  it('rejects disallowed file types', async () => {
    const fd = new FormData()
    fd.append('file', new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), 'malicious.sh')

    const res = await fetch(url(`/api/cards/${cardId}/attachments`), {
      method: 'POST',
      body: fd,
      headers: user.headers
    })
    expect(res.status).toBe(415)
  })

  it('cascades attachment deletion when card is deleted', async () => {
    // Create a new card with attachments
    const card2 = await createTestCard(user, boardId, statusId, { title: 'Cascade Card' })
    const att = await uploadAttachment(user, cardId, { filename: 'cascade.txt', content: 'cascade test' })

    // Create attachment on card2
    const att2 = await uploadAttachment(user, card2.id, { filename: 'cascade2.txt', content: 'cascade2' })

    // Delete card2
    await $fetch(`/api/cards/${card2.id}`, {
      method: 'DELETE',
      headers: user.headers
    })

    // Attachment for card2 should be gone
    const res = await fetch(url(`/api/attachments/${att2.id}/download`), {
      headers: user.headers
    })
    expect(res.status).toBe(404)

    // Original card's attachment should still exist
    const res2 = await fetch(url(`/api/attachments/${att.id}/download`), {
      headers: user.headers
    })
    expect(res2.status).toBe(200)
  })

  it('includes attachmentCount in board response', async () => {
    const fullBoard = await getBoard(user, boardId) as Record<string, unknown>
    const cardWithAttachments = fullBoard.cards.find((c: Record<string, unknown>) => c.id === cardId)
    expect(cardWithAttachments).toBeDefined()
    expect(cardWithAttachments.attachmentCount).toBeGreaterThanOrEqual(1)
  })
})
