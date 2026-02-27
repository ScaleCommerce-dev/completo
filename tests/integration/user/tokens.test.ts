import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'

describe('Token Management API', async () => {
  let user: TestUser
  let otherUser: TestUser

  beforeAll(async () => {
    user = await registerTestUser()
    otherUser = await registerTestUser()
  })

  describe('POST /api/user/tokens', () => {
    it('creates a token and returns raw token with dzo_ prefix', async () => {
      const result = await $fetch('/api/user/tokens', {
        method: 'POST',
        body: { name: 'My Token' },
        headers: user.headers
      }) as Record<string, unknown>

      expect(result.id).toBeDefined()
      expect(result.name).toBe('My Token')
      expect(result.token).toMatch(/^dzo_/)
      expect(result.tokenPrefix).toBe(result.token.slice(0, 8))
      expect(result.createdAt).toBeDefined()
      expect(result.expiresAt).toBeNull()
    })

    it('creates a token with expiry', async () => {
      const result = await $fetch('/api/user/tokens', {
        method: 'POST',
        body: { name: 'Expiring Token', expiresInDays: 30 },
        headers: user.headers
      }) as Record<string, unknown>

      expect(result.expiresAt).toBeDefined()
      const expiresAt = new Date(result.expiresAt).getTime()
      const expectedMin = Date.now() + 29 * 24 * 60 * 60 * 1000
      const expectedMax = Date.now() + 31 * 24 * 60 * 60 * 1000
      expect(expiresAt).toBeGreaterThan(expectedMin)
      expect(expiresAt).toBeLessThan(expectedMax)
    })

    it('rejects empty name', async () => {
      const res = await fetch(new URL('/api/user/tokens', 'http://localhost:43210'), {
        method: 'POST',
        headers: { ...user.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '' })
      })
      expect(res.status).toBe(400)
    })

    it('rejects name over 100 chars', async () => {
      const res = await fetch(new URL('/api/user/tokens', 'http://localhost:43210'), {
        method: 'POST',
        headers: { ...user.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(101) })
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid expiresInDays', async () => {
      const res = await fetch(new URL('/api/user/tokens', 'http://localhost:43210'), {
        method: 'POST',
        headers: { ...user.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Expiry', expiresInDays: -1 })
      })
      expect(res.status).toBe(400)
    })

    it('enforces max 25 tokens per user', async () => {
      // Create tokens up to the limit (already have 2 from earlier tests)
      const tokenUser = await registerTestUser()
      for (let i = 0; i < 25; i++) {
        await $fetch('/api/user/tokens', {
          method: 'POST',
          body: { name: `Token ${i}` },
          headers: tokenUser.headers
        })
      }

      const res = await fetch(new URL('/api/user/tokens', 'http://localhost:43210'), {
        method: 'POST',
        headers: { ...tokenUser.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'One Too Many' })
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('25')
    })
  })

  describe('GET /api/user/tokens', () => {
    it('lists tokens without raw token', async () => {
      const tokens = await $fetch('/api/user/tokens', {
        headers: user.headers
      }) as Record<string, unknown>[]

      expect(tokens.length).toBeGreaterThanOrEqual(2)
      for (const token of tokens) {
        expect(token.id).toBeDefined()
        expect(token.name).toBeDefined()
        expect(token.tokenPrefix).toMatch(/^dzo_/)
        expect(token.createdAt).toBeDefined()
        expect(token).not.toHaveProperty('token')
        expect(token).not.toHaveProperty('tokenHash')
        expect(token.isExpired).toBeDefined()
      }
    })

    it('only shows own tokens', async () => {
      const otherTokens = await $fetch('/api/user/tokens', {
        headers: otherUser.headers
      }) as Record<string, unknown>[]

      // otherUser hasn't created any tokens yet
      expect(otherTokens.length).toBe(0)
    })
  })

  describe('DELETE /api/user/tokens/:id', () => {
    it('deletes own token', async () => {
      const created = await $fetch('/api/user/tokens', {
        method: 'POST',
        body: { name: 'To Delete' },
        headers: user.headers
      }) as Record<string, unknown>

      const result = await $fetch(`/api/user/tokens/${created.id}`, {
        method: 'DELETE',
        headers: user.headers
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
    })

    it('cannot delete another user\'s token', async () => {
      const created = await $fetch('/api/user/tokens', {
        method: 'POST',
        body: { name: 'Other User Token' },
        headers: otherUser.headers
      }) as Record<string, unknown>

      const res = await fetch(new URL(`/api/user/tokens/${created.id}`, 'http://localhost:43210'), {
        method: 'DELETE',
        headers: user.headers
      })
      expect(res.status).toBe(404)
    })
  })
})
