import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'

describe('POST /api/admin/users/[id]/resend-setup', () => {
  let admin: TestUser
  let regularUser: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
  })

  it('admin can resend setup email for pending user', async () => {
    const email = `resend-setup-${Date.now()}@example.com`
    const created = await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Resend Setup User', email },
      headers: admin.headers
    }) as any

    const result = await $fetch(`/api/admin/users/${created.id}/resend-setup`, {
      method: 'POST',
      headers: admin.headers
    }) as any

    expect(result.ok).toBe(true)
  })

  it('returns 400 if user has already completed setup', async () => {
    // regularUser is a fully registered user
    const res = await fetch(url(`/api/admin/users/${regularUser.id}/resend-setup`), {
      method: 'POST',
      headers: admin.headers
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain('already completed setup')
  })

  it('returns 404 for non-existent user', async () => {
    const res = await fetch(url('/api/admin/users/non-existent-id/resend-setup'), {
      method: 'POST',
      headers: admin.headers
    })
    expect(res.status).toBe(404)
  })

  it('non-admin gets 403', async () => {
    const email = `resend-nonadmin-${Date.now()}@example.com`
    const created = await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Another User', email },
      headers: admin.headers
    }) as any

    const res = await fetch(url(`/api/admin/users/${created.id}/resend-setup`), {
      method: 'POST',
      headers: regularUser.headers
    })
    expect(res.status).toBe(403)
  })
})
