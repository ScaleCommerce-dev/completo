import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'

describe('Admin Settings', () => {
  let admin: TestUser
  let regularUser: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
  })

  // Clean up: ensure allowed domains are cleared after all tests
  afterAll(async () => {
    await $fetch('/api/admin/settings', {
      method: 'PUT',
      body: { allowedEmailDomains: [] },
      headers: admin.headers
    })
  })

  describe('GET /api/admin/settings', () => {
    it('admin gets settings with defaults', async () => {
      const settings = await $fetch('/api/admin/settings', {
        headers: admin.headers
      }) as any

      expect(settings).toHaveProperty('allowedEmailDomains')
      expect(Array.isArray(settings.allowedEmailDomains)).toBe(true)
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url('/api/admin/settings'), {
        headers: regularUser.headers
      })
      expect(res.status).toBe(403)
    })

    it('unauthenticated gets 401', async () => {
      const res = await fetch(url('/api/admin/settings'))
      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/admin/settings', () => {
    it('admin can set allowed email domains', async () => {
      const result = await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: ['example.com', 'test.org'] },
        headers: admin.headers
      }) as any

      expect(result.allowedEmailDomains).toEqual(['example.com', 'test.org'])
    })

    it('domains are lowercased and deduplicated', async () => {
      const result = await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: ['Example.COM', 'example.com', 'Test.Org'] },
        headers: admin.headers
      }) as any

      expect(result.allowedEmailDomains).toEqual(['example.com', 'test.org'])
    })

    it('empty strings are filtered out', async () => {
      const result = await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: ['example.com', '', '  ', 'test.org'] },
        headers: admin.headers
      }) as any

      expect(result.allowedEmailDomains).toEqual(['example.com', 'test.org'])
    })

    it('admin can clear domains (empty array)', async () => {
      const result = await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: [] },
        headers: admin.headers
      }) as any

      expect(result.allowedEmailDomains).toEqual([])
    })

    it('rejects invalid domain format', async () => {
      const res = await fetch(url('/api/admin/settings'), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedEmailDomains: ['not a domain!'] })
      })
      expect(res.status).toBe(400)
    })

    it('rejects non-array value', async () => {
      const res = await fetch(url('/api/admin/settings'), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedEmailDomains: 'example.com' })
      })
      expect(res.status).toBe(400)
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url('/api/admin/settings'), {
        method: 'PUT',
        headers: { ...regularUser.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedEmailDomains: ['hacker.com'] })
      })
      expect(res.status).toBe(403)
    })
  })

  describe('Registration domain restriction', () => {
    beforeAll(async () => {
      await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: ['allowed.com'] },
        headers: admin.headers
      })
    })

    afterAll(async () => {
      // Clear restriction so other tests are not affected
      await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: [] },
        headers: admin.headers
      })
    })

    it('allows registration with allowed domain', async () => {
      const email = `user-${Date.now()}@allowed.com`
      const res = await fetch(url('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Allowed User', email, password: 'password123' })
      })
      expect(res.status).toBe(200)
    })

    it('rejects registration with non-allowed domain', async () => {
      const email = `user-${Date.now()}@forbidden.com`
      const res = await fetch(url('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Blocked User', email, password: 'password123' })
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message || body.data?.message).toContain('approved email domains')
    })

    it('allows all domains when list is cleared', async () => {
      // Clear restriction
      await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: [] },
        headers: admin.headers
      })

      const email = `user-${Date.now()}@anydomain.com`
      const res = await fetch(url('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Any Domain User', email, password: 'password123' })
      })
      expect(res.status).toBe(200)
    })
  })
})
