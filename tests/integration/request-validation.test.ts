import http from 'node:http'
import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestList, createTestTag, getBoard } from '../setup/fixtures'

/**
 * The request schemas in `shared/schemas/`. Each case here was a live bug before
 * they existed: a body the handler trusted by its TypeScript cast was stored as
 * sent, or reached drizzle and came back as a 500.
 */

async function send(user: TestUser, method: string, path: string, body?: unknown) {
  const res = await fetch(url(path), {
    method,
    headers: { ...user.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, message: (await res.json().catch(() => ({}))).message as string | undefined }
}

describe('request validation', () => {
  let user: TestUser
  let projectId: string
  let statusId: string

  beforeAll(async () => {
    user = await registerTestUser()
    const project = await createTestProject(user)
    projectId = project.id
    const detail = await $fetch<{ statuses: Array<{ id: string }> }>(`/api/projects/${projectId}`, { headers: user.headers })
    statusId = detail.statuses[0]!.id
  })

  describe('cards', () => {
    it('refuses a priority outside the four, on create and update, and says which field', async () => {
      const created = await send(user, 'POST', `/api/projects/${projectId}/cards`, { title: 'T', statusId, priority: 'bogus' })
      expect(created).toEqual({ status: 400, message: 'Priority must be low, medium, high or urgent' })

      const card = await createTestCard(user, projectId, statusId)
      expect((await send(user, 'PUT', `/api/cards/${card.id}`, { priority: 'bogus' })).status).toBe(400)
      const after = await $fetch<{ priority: string }>(`/api/cards/${card.id}`, { headers: user.headers })
      expect(after.priority).toBe('medium')
    })

    it('refuses a title that is not text or is blank, on update as on create', async () => {
      expect((await send(user, 'POST', `/api/projects/${projectId}/cards`, { title: 42, statusId })).status).toBe(400)
      expect((await send(user, 'POST', `/api/projects/${projectId}/cards`, { title: '   ', statusId })).message).toBe('Title is required')

      const card = await createTestCard(user, projectId, statusId)
      expect((await send(user, 'PUT', `/api/cards/${card.id}`, { title: '' })).status).toBe(400)
      expect((await send(user, 'PUT', `/api/cards/${card.id}`, { title: { evil: true } })).status).toBe(400)
    })

    it('stores a title trimmed', async () => {
      const card = await createTestCard(user, projectId, statusId, { title: '  Spaced  ' })
      expect(card.title).toBe('Spaced')
    })

    it('refuses a due date that is not a date, and an update that names nothing', async () => {
      const card = await createTestCard(user, projectId, statusId)
      expect((await send(user, 'PUT', `/api/cards/${card.id}`, { dueDate: 'soon' })).status).toBe(400)
      expect(await send(user, 'PUT', `/api/cards/${card.id}`, {})).toEqual({ status: 400, message: 'Nothing to update' })
      expect(await send(user, 'PUT', `/api/cards/${card.id}`)).toEqual({ status: 400, message: 'Request body must be a JSON object' })
    })

    it('refuses an out-of-range position on a move', async () => {
      const card = await createTestCard(user, projectId, statusId)
      expect((await send(user, 'PUT', `/api/cards/${card.id}/move`, { statusId, position: -1 })).status).toBe(400)
      expect((await send(user, 'PUT', `/api/cards/${card.id}/move`, { statusId, position: 1.5 })).status).toBe(400)
    })
  })

  describe('views', () => {
    it('treats a null filter as no filter instead of failing with a 500', async () => {
      const board = await createTestBoard(user, projectId)
      const tag = await createTestTag(user, projectId)
      await $fetch(`/api/boards/${board.id}`, { method: 'PUT', body: { tagFilters: [tag.id] }, headers: user.headers })

      expect((await send(user, 'PUT', `/api/boards/${board.id}`, { tagFilters: null })).status).toBe(200)
      expect((await getBoard(user, board.id)).tagFilters).toEqual([])

      const list = await createTestList(user, projectId)
      expect((await send(user, 'PUT', `/api/lists/${list.id}`, { statusFilters: null })).status).toBe(200)
    })

    it('refuses a filter that is not a list, which used to be stored as a JSON string', async () => {
      const board = await createTestBoard(user, projectId)
      expect((await send(user, 'PUT', `/api/boards/${board.id}`, { tagFilters: 'abc' })).status).toBe(400)
      expect((await send(user, 'PUT', `/api/boards/${board.id}`, { priorityFilters: ['bogus'] })).status).toBe(400)
      expect((await getBoard(user, board.id)).tagFilters).toEqual([])
    })

    it('refuses an out-of-range column position on every reorder', async () => {
      const board = await createTestBoard(user, projectId)
      const list = await createTestList(user, projectId)
      const columns = [{ id: 'x', position: -1 }]
      expect((await send(user, 'PUT', `/api/boards/${board.id}/columns/reorder`, { columns })).status).toBe(400)
      expect((await send(user, 'PUT', `/api/lists/${list.id}/columns/reorder`, { columns })).status).toBe(400)
      // This one had no position check at all.
      expect((await send(user, 'PUT', '/api/my-tasks/columns/reorder', { columns })).status).toBe(400)
    })
  })

  describe('projects, statuses, tags and profile', () => {
    it('refuses a retention below one day on create, as update already did', async () => {
      // A negative retention put every done card's cutoff in the future, hiding them all.
      for (const doneRetentionDays of [-1, 0, 1.5, '30']) {
        const res = await send(user, 'POST', '/api/projects', { name: 'Retention', doneRetentionDays })
        expect(res, String(doneRetentionDays)).toEqual({ status: 400, message: 'doneRetentionDays must be a positive integer or null' })
      }
      expect((await send(user, 'POST', '/api/projects', { name: 'Kept forever', doneRetentionDays: null })).status).toBe(201)
    })

    it('answers an update that names nothing with a 400, not a 500 from an empty SET', async () => {
      const tag = await createTestTag(user, projectId)
      for (const path of [`/api/statuses/${statusId}`, `/api/tags/${tag.id}`, `/api/projects/${projectId}`, '/api/user/profile']) {
        expect(await send(user, 'PUT', path, {}), path).toEqual({ status: 400, message: 'Nothing to update' })
      }
    })

    it('refuses a blank status or tag name, and stores a name trimmed', async () => {
      const tag = await createTestTag(user, projectId)
      expect((await send(user, 'PUT', `/api/statuses/${statusId}`, { name: '  ' })).status).toBe(400)
      expect((await send(user, 'PUT', `/api/tags/${tag.id}`, { name: '' })).status).toBe(400)
      const renamed = await $fetch<{ name: string }>(`/api/tags/${tag.id}`, { method: 'PUT', body: { name: ' Urgent ' }, headers: user.headers })
      expect(renamed.name).toBe('Urgent')
    })

    it('refuses a colour mode outside the three', async () => {
      expect((await send(user, 'PUT', '/api/user/profile', { colorMode: 'neon' })).status).toBe(400)
    })
  })

  it('refuses an upload whose declared size is too large before reading its body', async () => {
    // The server must answer from the header alone: the body below never arrives.
    const card = await createTestCard(user, projectId, statusId)
    const target = new URL(url(`/api/cards/${card.id}/attachments`))
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: { ...user.headers, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(1024 * 1024 * 1024) }
      }, (res) => {
        res.resume()
        resolve(res.statusCode!)
        req.destroy()
      })
      req.on('error', reject)
      req.write('--x\r\n')
    })
    expect(status).toBe(413)
  })
})
