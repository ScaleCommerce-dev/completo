import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'

describe('GET /api/admin/users', () => {
  let admin: TestUser
  let regularUser: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
  })

  it('admin gets all users without passwordHash', async () => {
    const users = await $fetch('/api/admin/users', {
      headers: admin.headers
    }) as Record<string, unknown>[]

    expect(users.length).toBeGreaterThanOrEqual(2)
    expect(users[0]).toHaveProperty('id')
    expect(users[0]).toHaveProperty('email')
    expect(users[0]).toHaveProperty('name')
    expect(users[0]).toHaveProperty('isAdmin')
    expect(users[0]).toHaveProperty('createdAt')
    expect(users[0]).not.toHaveProperty('passwordHash')
    expect(users[0]).not.toHaveProperty('password_hash')
  })

  it('includes lastSeenAt and suspendedAt fields', async () => {
    const users = await $fetch('/api/admin/users', {
      headers: admin.headers
    }) as Record<string, unknown>[]

    const found = users.find((u: Record<string, unknown>) => u.id === regularUser.id)
    expect(found).toBeDefined()
    expect(found).toHaveProperty('lastSeenAt')
    expect(found).toHaveProperty('suspendedAt')
    expect(found.lastSeenAt).not.toBeNull()
    expect(found.suspendedAt).toBeNull()
  })

  it('non-admin gets 403', async () => {
    const res = await fetch(url('/api/admin/users'), {
      headers: regularUser.headers
    })
    expect(res.status).toBe(403)
  })

  it('unauthenticated gets 401', async () => {
    const res = await fetch(url('/api/admin/users'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/admin/users/[id] (suspend)', () => {
  let admin: TestUser
  let target: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    target = await registerTestUser()
  })

  it('admin can suspend a user', async () => {
    const result = await $fetch(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      body: { suspended: true },
      headers: admin.headers
    }) as Record<string, unknown>
    expect(result.ok).toBe(true)

    const users = await $fetch('/api/admin/users', { headers: admin.headers }) as Record<string, unknown>[]
    const found = users.find((u: Record<string, unknown>) => u.id === target.id)
    expect(found.suspendedAt).not.toBeNull()
  })

  it('suspended user cannot log in', async () => {
    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target.email, password: 'testpass123' })
    })
    expect(res.status).toBe(403)
  })

  it('admin can unsuspend a user', async () => {
    const result = await $fetch(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      body: { suspended: false },
      headers: admin.headers
    }) as Record<string, unknown>
    expect(result.ok).toBe(true)

    // User can log in again
    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target.email, password: 'testpass123' })
    })
    expect(res.status).toBe(200)
  })

  it('admin cannot modify themselves', async () => {
    const res = await fetch(url(`/api/admin/users/${admin.id}`), {
      method: 'PATCH',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: true })
    })
    expect(res.status).toBe(400)
  })

  it('non-admin gets 403', async () => {
    const regularUser = await registerTestUser()
    const res = await fetch(url(`/api/admin/users/${target.id}`), {
      method: 'PATCH',
      headers: { ...regularUser.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: true })
    })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/admin/users/[id] (isAdmin)', () => {
  let admin: TestUser
  let target: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    target = await registerTestUser()
  })

  it('admin can promote user to admin', async () => {
    const result = await $fetch(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      body: { isAdmin: true },
      headers: admin.headers
    }) as Record<string, unknown>
    expect(result.ok).toBe(true)

    const users = await $fetch('/api/admin/users', { headers: admin.headers }) as Record<string, unknown>[]
    const found = users.find((u: Record<string, unknown>) => u.id === target.id)
    expect(found.isAdmin).toBe(1)
  })

  it('admin can demote admin to user', async () => {
    const result = await $fetch(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      body: { isAdmin: false },
      headers: admin.headers
    }) as Record<string, unknown>
    expect(result.ok).toBe(true)

    const users = await $fetch('/api/admin/users', { headers: admin.headers }) as Record<string, unknown>[]
    const found = users.find((u: Record<string, unknown>) => u.id === target.id)
    expect(found.isAdmin).toBe(0)
  })

  it('admin cannot demote themselves', async () => {
    const res = await fetch(url(`/api/admin/users/${admin.id}`), {
      method: 'PATCH',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: false })
    })
    expect(res.status).toBe(400)
  })

  it('rejects empty body', async () => {
    const res = await fetch(url(`/api/admin/users/${target.id}`), {
      method: 'PATCH',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(400)
  })
})
