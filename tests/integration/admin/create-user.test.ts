import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('POST /api/admin/users (create user)', () => {
  let admin: TestUser
  let regularUser: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
  })

  it('admin can create a user', async () => {
    const email = `admin-created-${Date.now()}@example.com`
    const res = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Created User', email })
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.email).toBe(email.toLowerCase())
    expect(body.name).toBe('Created User')
  })

  it('created user appears in admin user list', async () => {
    const email = `list-check-${Date.now()}@example.com`
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'List Check User', email },
      headers: admin.headers
    })

    const users = await $fetch('/api/admin/users', { headers: admin.headers }) as Record<string, unknown>[]
    const found = users.find(u => u.email === email.toLowerCase())
    expect(found).toBeDefined()
    expect(found.name).toBe('List Check User')
  })

  it('created user cannot log in without setting password', async () => {
    const email = `no-password-${Date.now()}@example.com`
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'No Password', email },
      headers: admin.headers
    })

    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'anything123' })
    })
    expect(res.status).toBe(401)
  })

  it('duplicate email returns generic error', async () => {
    const email = `dup-${Date.now()}@example.com`
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'First', email },
      headers: admin.headers
    })

    const res = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second', email })
    })
    expect(res.status).toBe(400)
  })

  it('non-admin gets 403', async () => {
    const res = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { ...regularUser.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Should Fail', email: 'fail@example.com' })
    })
    expect(res.status).toBe(403)
  })

  it('rejects missing fields', async () => {
    const res = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Email' })
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid email format', async () => {
    const res = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { ...admin.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Email', email: 'not-an-email' })
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/setup-account', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
  })

  it('created user can set password and sign in via setup-account', async () => {
    const email = `setup-${Date.now()}@example.com`
    const created = await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Setup User', email },
      headers: admin.headers
    }) as Record<string, unknown>

    // Get verification token via test endpoint
    const tokenInfo = await $fetch('/api/_test/get-verification-token', {
      params: { userId: created.id }
    }) as Record<string, unknown>

    // Setup account
    const setupRes = await fetch(url('/auth/setup-account'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInfo.token, password: 'newpass123' })
    })
    expect(setupRes.status).toBe(200)

    const setupBody = await setupRes.json()
    expect(setupBody.ok).toBe(true)

    // Should be able to log in now
    const loginRes = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'newpass123' })
    })
    expect(loginRes.status).toBe(200)
  })

  it('rejects invalid token', async () => {
    const res = await fetch(url('/auth/setup-account'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token', password: 'testpass123' })
    })
    expect(res.status).toBe(400)
  })

  it('rejects short password', async () => {
    const email = `short-pw-${Date.now()}@example.com`
    const created = await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Short PW', email },
      headers: admin.headers
    }) as Record<string, unknown>

    const tokenInfo = await $fetch('/api/_test/get-verification-token', {
      params: { userId: created.id }
    }) as Record<string, unknown>

    const res = await fetch(url('/auth/setup-account'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInfo.token, password: 'short' })
    })
    expect(res.status).toBe(400)
  })

  it('setup-account claims pending project invitations', async () => {
    const invOwner = await registerTestUser()
    const invProject = await createTestProject(invOwner)

    const email = `setup-inv-${Date.now()}@example.com`

    // Create the user via admin
    const created = await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Setup Inv User', email },
      headers: admin.headers
    }) as Record<string, unknown>

    // Invite that email to a project
    await fetch(url(`/api/projects/${invProject.id}/members`), {
      method: 'POST',
      headers: { ...invOwner.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })

    // Get verification token
    const tokenInfo = await $fetch('/api/_test/get-verification-token', {
      params: { userId: created.id }
    }) as Record<string, unknown>

    // Setup account
    const setupRes = await fetch(url('/auth/setup-account'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInfo.token, password: 'testpass123' })
    })
    expect(setupRes.status).toBe(200)

    // Log in and check membership
    const loginRes = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'testpass123' })
    })
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]

    const members = await $fetch(`/api/projects/${invProject.id}/members`, {
      headers: { cookie }
    }) as Record<string, unknown>[]
    const found = members.find(m => m.id === created.id)
    expect(found).toBeDefined()
  })
})
