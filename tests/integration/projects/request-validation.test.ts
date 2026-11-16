import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestList } from '../../setup/fixtures'

/**
 * Request schemas for a project's structure and membership: views, statuses,
 * tags, columns and members. A malformed body is a 400 that names the field,
 * never a 500 and never a row stored as sent.
 */

async function send(user: TestUser, method: string, path: string, body?: unknown) {
  const res = await fetch(url(path), {
    method,
    headers: { ...user.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, message: (await res.json().catch(() => ({}))).message as string | undefined }
}

describe('project structure request validation', () => {
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

  it('refuses a view with a blank or non-text name, or filters that are not a list', async () => {
    for (const kind of ['boards', 'lists']) {
      const path = `/api/projects/${projectId}/${kind}`
      const label = kind === 'boards' ? 'Board' : 'List'
      expect(await send(user, 'POST', path, { name: '  ' }), kind).toEqual({ status: 400, message: `${label} name is required` })
      expect((await send(user, 'POST', path, { name: 42 })).status, kind).toBe(400)
      expect((await send(user, 'POST', path, { name: 'V', tagFilters: 'abc' })).status, kind).toBe(400)
      expect((await send(user, 'POST', path, { name: 'V', columns: 'abc' })).status, kind).toBe(400)
      expect(await send(user, 'POST', path), kind).toEqual({ status: 400, message: 'Request body must be a JSON object' })
    }
  })

  it('refuses a list column outside the field registry, at creation and when added', async () => {
    const created = await send(user, 'POST', `/api/projects/${projectId}/lists`, { name: 'L', columns: ['title', 'bogus'] })
    expect(created.status).toBe(400)
    expect(created.message).toContain('bogus')

    const list = await createTestList(user, projectId)
    expect((await send(user, 'POST', `/api/lists/${list.id}/columns`, { field: 'bogus' })).status).toBe(400)
    expect(await send(user, 'POST', `/api/lists/${list.id}/columns`, {})).toEqual({ status: 400, message: 'Field is required' })
    expect((await send(user, 'POST', '/api/my-tasks/columns', { field: 7 })).status).toBe(400)
  })

  it('refuses a status or tag with a blank name or a colour that is not hex, and keeps the default colour', async () => {
    const board = await createTestBoard(user, projectId)
    for (const [path, label] of [
      [`/api/projects/${projectId}/statuses`, 'Status'],
      [`/api/projects/${projectId}/tags`, 'Tag'],
      [`/api/boards/${board.id}/columns`, 'Status']
    ] as const) {
      expect(await send(user, 'POST', path, { name: '' }), path).toEqual({ status: 400, message: `${label} name is required` })
      expect((await send(user, 'POST', path, { name: 'X', color: 'red' })).status, path).toBe(400)
      expect(await send(user, 'POST', path), path).toEqual({ status: 400, message: 'Request body must be a JSON object' })
    }
    const tag = await $fetch<{ name: string, color: string }>(`/api/projects/${projectId}/tags`, { method: 'POST', body: { name: ' Plain ', color: '' }, headers: user.headers })
    expect(tag.name).toBe('Plain')
    expect(tag.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('refuses linking without a status id, and folding My Tasks without a project id', async () => {
    const board = await createTestBoard(user, projectId)
    expect(await send(user, 'POST', `/api/boards/${board.id}/columns/link`, {})).toEqual({ status: 400, message: 'statusId is required' })
    expect((await send(user, 'POST', `/api/boards/${board.id}/columns/link`, { statusId: 5 })).status).toBe(400)
    expect(await send(user, 'POST', '/api/my-tasks/collapse', { projectId: '' })).toEqual({ status: 400, message: 'projectId is required' })
  })

  it('deletes an empty status with no body at all, and refuses a body of the wrong shape', async () => {
    const empty = await $fetch<{ id: string }>(`/api/projects/${projectId}/statuses`, { method: 'POST', body: { name: 'Empty' }, headers: user.headers })
    const res = await fetch(url(`/api/statuses/${empty.id}`), { method: 'DELETE', headers: user.headers })
    expect(res.status).toBe(200)

    const other = await $fetch<{ id: string }>(`/api/projects/${projectId}/statuses`, { method: 'POST', body: { name: 'Other' }, headers: user.headers })
    expect((await send(user, 'DELETE', `/api/statuses/${other.id}`, { moveToStatusId: 3 })).status).toBe(400)
    expect((await send(user, 'DELETE', `/api/statuses/${other.id}`, { moveToStatusId: statusId })).status).toBe(200)
  })

  it('refuses a member add without userId or email, and a role outside the two', async () => {
    expect(await send(user, 'POST', `/api/projects/${projectId}/members`, {})).toEqual({ status: 400, message: 'userId or email is required' })
    expect((await send(user, 'POST', `/api/projects/${projectId}/members`, { email: ['a@b.c'] })).status).toBe(400)
    expect(await send(user, 'PATCH', `/api/projects/${projectId}/members/${user.id}`, { role: 'admin' })).toEqual({ status: 400, message: 'Role must be "owner" or "member"' })
    expect((await send(user, 'PATCH', `/api/projects/${projectId}/members/${user.id}`)).status).toBe(400)
  })
})
