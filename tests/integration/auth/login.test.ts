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

  it('sets the session cookie with Secure, HttpOnly and SameSite', async () => {
    // `secure` was pinned to false in nuxt.config, overriding h3's secure-by-default, so every
    // HTTPS install shipped a session cookie that a plain-HTTP request to the same host could
    // collect. The test server runs over HTTP and doesn't set NUXT_SESSION_COOKIE_SECURE, so
    // what's asserted here is the shipped default — which is the thing that regressed.
    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    expect(res.status).toBe(200)

    const cookie = res.headers.getSetCookie().find(c => c.startsWith('nuxt-session='))
    expect(cookie).toBeTruthy()
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    // An empty `domain` in the config must not become a `Domain=` attribute.
    expect(cookie).not.toContain('Domain=')
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
