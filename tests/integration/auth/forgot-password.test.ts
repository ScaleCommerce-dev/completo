import { describe, it, expect } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser } from '../../setup/auth'

describe('POST /auth/forgot-password', () => {
  it('returns generic message for valid email', async () => {
    const user = await registerTestUser()
    const body = await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    }) as { message: string }
    expect(body.message).toContain('If an account')
  })

  it('returns generic message for non-existent email (anti-enumeration)', async () => {
    const body = await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: `nonexistent-${Date.now()}@example.com` }
    }) as { message: string }
    expect(body.message).toContain('If an account')
  })

  it('returns 400 when email missing', async () => {
    const res = await fetch(url('/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(400)
  })

  it('returns generic message for suspended user (no token created)', async () => {
    const user = await registerTestUser()
    const admin = await createAdminUser()
    // Suspend user
    await $fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: { suspended: true },
      headers: admin.headers
    })
    const body = await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    }) as { message: string }
    expect(body.message).toContain('If an account')
  })
})

describe('POST /auth/reset-password', () => {
  it('resets password with valid token and auto-signs in', async () => {
    const user = await registerTestUser()

    // Request reset
    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })

    // Get token via test endpoint
    const tokenBody = await $fetch(`/api/_test/get-verification-token?userId=${user.id}`) as { token: string }
    expect(tokenBody.token).toBeTruthy()

    // Reset password
    const res = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenBody.token, password: 'newpassword123' })
    })
    expect(res.status).toBe(200)

    // Should have session cookie (auto-sign in)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
  })

  it('old password stops working after reset', async () => {
    const user = await registerTestUser()

    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })
    const tokenBody = await $fetch(`/api/_test/get-verification-token?userId=${user.id}`) as { token: string }

    await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenBody.token, password: 'newpassword123' })
    })

    // Old password should fail
    const loginOld = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'testpass123' })
    })
    expect(loginOld.status).toBe(401)

    // New password should work
    const loginNew = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'newpassword123' })
    })
    expect(loginNew.status).toBe(200)
  })

  it('returns 400 for invalid token', async () => {
    const res = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token', password: 'newpassword123' })
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing token or password', async () => {
    const res = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '', password: '' })
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for password under 8 characters', async () => {
    const user = await registerTestUser()
    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })
    const tokenBody = await $fetch(`/api/_test/get-verification-token?userId=${user.id}`) as { token: string }

    const res = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenBody.token, password: 'short' })
    })
    expect(res.status).toBe(400)
  })

  it('token is consumed after use (cannot reuse)', async () => {
    const user = await registerTestUser()
    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })
    const tokenBody = await $fetch(`/api/_test/get-verification-token?userId=${user.id}`) as { token: string }

    // First use succeeds
    const res1 = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenBody.token, password: 'newpassword123' })
    })
    expect(res1.status).toBe(200)

    // Second use fails (token deleted)
    const res2 = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenBody.token, password: 'anotherpassword' })
    })
    expect(res2.status).toBe(400)
  })

  it('new reset request invalidates old token', async () => {
    const user = await registerTestUser()

    // First request
    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })
    const token1 = await $fetch(`/api/_test/get-verification-token?userId=${user.id}`) as { token: string }

    // Second request (invalidates first)
    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })
    const token2 = await $fetch(`/api/_test/get-verification-token?userId=${user.id}`) as { token: string }

    expect(token2.token).not.toBe(token1.token)

    // Old token should not work
    const res = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token1.token, password: 'newpassword123' })
    })
    expect(res.status).toBe(400)
  })
})
