import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestAgent } from '../../setup/agents'

/**
 * Admin and agent bodies, parsed by `shared/schemas/admin.ts` and `agent.ts`. Each
 * endpoint refuses a malformed body, and a missing one, with a 400 rather than
 * reading fields off `undefined` or storing what it was sent.
 */

async function send(user: TestUser, method: string, path: string, body?: unknown) {
  const res = await fetch(url(path), {
    method,
    headers: { ...user.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, message: (await res.json().catch(() => ({}))).message as string | undefined }
}

describe('admin and agent request validation', () => {
  let admin: TestUser
  let plain: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    plain = await registerTestUser()
  })

  describe('admin', () => {
    it('settings: refuses a missing body, an empty one and a domain list of the wrong shape', async () => {
      expect(await send(admin, 'PUT', '/api/admin/settings')).toEqual({ status: 400, message: 'Request body must be a JSON object' })
      expect(await send(admin, 'PUT', '/api/admin/settings', {})).toEqual({ status: 400, message: 'Nothing to update' })
      expect(await send(admin, 'PUT', '/api/admin/settings', { allowedEmailDomains: [42] })).toEqual({ status: 400, message: 'Each domain must be a string' })
      expect(await send(admin, 'PUT', '/api/admin/settings', { allowedEmailDomains: ['ok.com', 'bad domain'] })).toEqual({ status: 400, message: 'Invalid domain: "bad domain"' })
    })

    it('skills: refuses a name or prompt that is not text, an empty update, and a reorder position out of range', async () => {
      expect((await send(admin, 'POST', '/api/admin/skills', { name: 42, prompt: 'P' })).status).toBe(400)
      expect(await send(admin, 'POST', '/api/admin/skills', { name: 'N', prompt: ['P'] })).toEqual({ status: 400, message: 'Prompt is required' })
      expect((await send(admin, 'POST', '/api/admin/skills')).status).toBe(400)

      const skill = await $fetch<{ id: string, name: string }>('/api/admin/skills', { method: 'POST', body: { name: '  Trimmed  ', prompt: 'P', scope: '' }, headers: admin.headers })
      expect(skill.name).toBe('Trimmed')
      expect(await send(admin, 'PUT', `/api/admin/skills/${skill.id}`, {})).toEqual({ status: 400, message: 'Nothing to update' })
      expect(await send(admin, 'PUT', `/api/admin/skills/${skill.id}`, { prompt: '   ' })).toEqual({ status: 400, message: 'Prompt cannot be empty' })

      expect((await send(admin, 'PUT', '/api/admin/skills/reorder', { skills: [{ id: skill.id, position: -1 }] })).status).toBe(400)
      expect((await send(admin, 'PUT', '/api/admin/skills/reorder', { skills: 'all' })).status).toBe(400)
    })

    it('users: refuses a missing or non-text name or email, and a flag that is not a boolean', async () => {
      expect((await send(admin, 'POST', '/api/admin/users')).status).toBe(400)
      expect(await send(admin, 'POST', '/api/admin/users', { name: 'N', email: 42 })).toEqual({ status: 400, message: 'Name and email are required' })
      expect(await send(admin, 'POST', '/api/admin/users', { name: 'N', email: 'nope' })).toEqual({ status: 400, message: 'Invalid email format' })

      expect(await send(admin, 'PATCH', `/api/admin/users/${plain.id}`, { isAdmin: 'yes' })).toEqual({ status: 400, message: 'isAdmin must be a boolean' })
      expect(await send(admin, 'PATCH', `/api/admin/users/${plain.id}`, {})).toEqual({ status: 400, message: 'No valid fields to update' })
      expect((await send(admin, 'PATCH', `/api/admin/users/${plain.id}`)).status).toBe(400)
      const after = await $fetch<Array<{ id: string, isAdmin: number }>>('/api/admin/users', { headers: admin.headers })
      expect(after.find(u => u.id === plain.id)?.isAdmin).toBe(0)
    })

    it('hand-over: refuses a missing body, an unknown action and a transfer naming nobody', async () => {
      const person = await registerTestUser()
      expect((await send(admin, 'POST', `/api/admin/users/${person.id}/hand-over`)).status).toBe(400)
      expect(await send(admin, 'POST', `/api/admin/users/${person.id}/hand-over`, { action: 'delete' })).toEqual({ status: 400, message: 'action must be "transfer" or "suspend"' })
      expect(await send(admin, 'POST', `/api/admin/users/${person.id}/hand-over`, { action: 'transfer' })).toEqual({ status: 400, message: 'toUserId is required' })
      // A person who does not exist is still a 404, whatever the body.
      expect((await send(admin, 'POST', '/api/admin/users/00000000-0000-0000-0000-000000000000/hand-over')).status).toBe(404)
    })
  })

  describe('agents', () => {
    it('create and update: refuses fields of the wrong type, an empty update and a missing body', async () => {
      expect((await send(admin, 'POST', '/api/agents')).status).toBe(400)
      expect(await send(admin, 'POST', '/api/agents', { name: 42 })).toEqual({ status: 400, message: 'Name is required' })
      expect(await send(admin, 'POST', '/api/agents', { name: 'A', description: 7 })).toEqual({ status: 400, message: 'Description must be a string' })

      const agent = await createTestAgent(admin)
      expect(await send(admin, 'PATCH', `/api/agents/${agent.id}`, {})).toEqual({ status: 400, message: 'No valid fields to update' })
      expect(await send(admin, 'PATCH', `/api/agents/${agent.id}`, { color: 'red' })).toEqual({ status: 400, message: 'Colour must be a hex value like #f97316' })
      expect((await send(admin, 'PATCH', `/api/agents/${agent.id}`)).status).toBe(400)

      // A blank description is stored as none, and a colour lowercased, as before.
      const updated = await $fetch<{ description: string | null, color: string | null }>(`/api/agents/${agent.id}`, { method: 'PATCH', body: { description: '  ', color: '#ABCDEF' }, headers: admin.headers })
      expect(updated).toMatchObject({ description: null, color: '#abcdef' })
    })

    it('bulk actions and transfer: refuse an id list of the wrong shape and a missing new manager', async () => {
      const agent = await createTestAgent(admin)
      for (const agentIds of [undefined, [], 'x', [1]]) {
        expect(await send(admin, 'POST', '/api/agents/suspend', { agentIds }), JSON.stringify(agentIds)).toEqual({ status: 400, message: 'agentIds must be a non-empty array of ids' })
      }
      expect(await send(admin, 'POST', '/api/agents/transfer', { agentIds: [agent.id] })).toEqual({ status: 400, message: 'toUserId is required' })
      expect(await send(admin, 'POST', `/api/agents/${agent.id}/transfer`, { toUserId: 5 })).toEqual({ status: 400, message: 'toUserId is required' })
      expect((await send(admin, 'POST', `/api/agents/${agent.id}/transfer`)).status).toBe(400)
      expect((await send(admin, 'POST', `/api/agents/${agent.id}/transfer`, { toUserId: plain.id, dryRun: 'yes' })).status).toBe(400)
    })
  })
})
