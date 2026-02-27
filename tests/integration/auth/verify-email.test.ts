import { describe, it, expect } from 'vitest'
import { $fetch, url } from '../../setup/server'

describe('Email verification flow', async () => {
  it('GET /auth/verify-email with valid token verifies user and redirects', async () => {
    const email = `verify-valid-${Date.now()}@test.com`

    // Register (creates unverified user + token)
    const regBody = await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Verify Valid', email, password: 'password123' }
    }) as { user: { id: string } }

    // Get the token from DB via test endpoint
    const tokenBody = await $fetch(`/api/_test/get-verification-token?userId=${regBody.user.id}`) as { token: string }
    expect(tokenBody.token).toBeTruthy()

    // Verify email via GET (don't follow redirects)
    const res = await fetch(url(`/auth/verify-email?token=${tokenBody.token}`), {
      redirect: 'manual'
    })

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('/projects')

    // Should have a session cookie (auto-sign in)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
  })

  it('GET /auth/verify-email with invalid token redirects with error', async () => {
    const res = await fetch(url('/auth/verify-email?token=invalid-token-123'), {
      redirect: 'manual'
    })

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('/login?error=invalid-token')
  })

  it('GET /auth/verify-email without token redirects with error', async () => {
    const res = await fetch(url('/auth/verify-email'), {
      redirect: 'manual'
    })

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('/login?error=invalid-token')
  })

  it('POST /auth/resend-verification sends new token for unverified user', async () => {
    const email = `resend-${Date.now()}@test.com`

    const regBody = await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Resend User', email, password: 'password123' }
    }) as { user: { id: string } }

    // Get original token
    const originalToken = await $fetch(`/api/_test/get-verification-token?userId=${regBody.user.id}`) as { token: string }

    // Resend
    const resendBody = await $fetch('/auth/resend-verification', {
      method: 'POST',
      body: { email }
    }) as { message: string }

    expect(resendBody.message).toBeTruthy()

    // New token should be different
    const newToken = await $fetch(`/api/_test/get-verification-token?userId=${regBody.user.id}`) as { token: string }
    expect(newToken.token).toBeTruthy()
    expect(newToken.token).not.toBe(originalToken.token)
  })

  it('POST /auth/resend-verification via expired token cookie sends new token', async () => {
    const email = `resend-token-${Date.now()}@test.com`

    const regBody = await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Resend Token User', email, password: 'password123' }
    }) as { user: { id: string } }

    // Get the original token
    const originalToken = await $fetch(`/api/_test/get-verification-token?userId=${regBody.user.id}`) as { token: string }

    // Resend using the token in a cookie (as the expired-token flow would)
    const resendBody = await $fetch('/auth/resend-verification', {
      method: 'POST',
      body: {},
      headers: { cookie: `expired-verification-token=${originalToken.token}` }
    }) as { message: string }

    expect(resendBody.message).toBeTruthy()

    // New token should be different
    const newToken = await $fetch(`/api/_test/get-verification-token?userId=${regBody.user.id}`) as { token: string }
    expect(newToken.token).toBeTruthy()
    expect(newToken.token).not.toBe(originalToken.token)
  })

  it('POST /auth/resend-verification returns success for non-existent email', async () => {
    const body = await $fetch('/auth/resend-verification', {
      method: 'POST',
      body: { email: 'nonexistent-resend@test.com' }
    }) as { message: string }

    expect(body.message).toBeTruthy()
  })

  it('POST /auth/resend-verification returns success for already-verified user', async () => {
    const email = `already-verified-${Date.now()}@test.com`

    // Register and verify
    const regBody = await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Already Verified', email, password: 'password123' }
    }) as { user: { id: string } }

    await $fetch('/api/_test/verify-email', {
      method: 'POST',
      body: { userId: regBody.user.id }
    })

    // Resend should still return success (no enumeration)
    const body = await $fetch('/auth/resend-verification', {
      method: 'POST',
      body: { email }
    }) as { message: string }

    expect(body.message).toBeTruthy()
  })
})
