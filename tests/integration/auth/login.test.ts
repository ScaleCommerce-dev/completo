import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'

describe('POST /auth/login', async () => {
  const email = `login-${Date.now()}@test.com`
  const password = 'password123'

  beforeAll(async () => {
    // Register a user and verify their email
    const regBody = await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Login Test User', email, password }
    }) as { user: { id: string } }

    await $fetch('/api/_test/verify-email', {
      method: 'POST',
      body: { userId: regBody.user.id }
    })
  })

  it('logs in with correct credentials', async () => {
    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.email).toBe(email)

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
  })

  it('rejects login for unverified user', async () => {
    const unverifiedEmail = `unverified-${Date.now()}@test.com`
    await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Unverified', email: unverifiedEmail, password: 'password123' }
    })

    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unverifiedEmail, password: 'password123' })
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toContain('verify')
  })

  it('rejects wrong password', async () => {
    await expectError($fetch('/auth/login', {
      method: 'POST',
      body: { email, password: 'wrongpassword' }
    }), 401)
  })

  it('rejects non-existent email', async () => {
    await expectError($fetch('/auth/login', {
      method: 'POST',
      body: { email: 'nonexistent@test.com', password: 'whatever' }
    }), 401)
  })

  it('rejects missing fields', async () => {
    await expectError($fetch('/auth/login', {
      method: 'POST',
      body: { email }
    }), 400)
  })
})
