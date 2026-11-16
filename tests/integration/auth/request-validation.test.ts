import { describe, it, expect, beforeAll } from 'vitest'
import { url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestAgent } from '../../setup/agents'

/**
 * The auth and token bodies in `shared/schemas/auth.ts`. Before them a body
 * of the wrong shape reached `.trim()` or `.length` on a non-string and came
 * back as a 500; now it gets the same 400 a missing field always got, so a
 * malformed body tells a caller nothing a missing one would not.
 * (Rate limiting is off while test endpoints are on.)
 */

async function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url(path), {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, message: (await res.json().catch(() => ({}))).message as string | undefined }
}

describe('auth request validation', () => {
  it('login answers a non-string or missing field as a missing one', async () => {
    const required = { status: 400, message: 'Email and password are required' }
    expect(await send('POST', '/auth/login', { email: ['a@b.c'], password: 'x' })).toEqual(required)
    expect(await send('POST', '/auth/login', { email: 'a@b.c', password: 12345678 })).toEqual(required)
    expect(await send('POST', '/auth/login', { email: { $ne: '' }, password: 'x' })).toEqual(required)
    expect((await send('POST', '/auth/login')).status).toBe(400)
  })

  it('register refuses a non-string field and keeps the password policy', async () => {
    const required = { status: 400, message: 'Name, email, and password are required' }
    expect(await send('POST', '/auth/register', { name: 1, email: 'x@example.com', password: 'longenough' })).toEqual(required)
    expect(await send('POST', '/auth/register', { name: 'X', email: true, password: 'longenough' })).toEqual(required)
    expect(await send('POST', '/auth/register', { name: 'X', email: 'x@example.com', password: 'short' }))
      .toEqual({ status: 400, message: 'Password must be at least 8 characters' })
    expect((await send('POST', '/auth/register', { name: 'X', email: 'x@example.com', password: 'longenough', invitation: 42 })).status).toBe(400)
  })

  it('forgot-password and resend-verification refuse a non-string email', async () => {
    expect(await send('POST', '/auth/forgot-password', { email: 42 })).toEqual({ status: 400, message: 'Email is required' })
    expect((await send('POST', '/auth/forgot-password')).status).toBe(400)
    expect((await send('POST', '/auth/resend-verification', { email: ['a@b.c'] })).status).toBe(400)
    // No body and no cookie: the email the handler needs is missing, not malformed.
    expect(await send('POST', '/auth/resend-verification')).toEqual({ status: 400, message: 'Email is required' })
  })

  it('reset-password and setup-account refuse a non-string token or password', async () => {
    for (const path of ['/auth/reset-password', '/auth/setup-account']) {
      const required = { status: 400, message: 'Token and password are required' }
      expect(await send('POST', path, { token: 1, password: 'longenough' }), path).toEqual(required)
      expect(await send('POST', path, { token: 'abc', password: ['longenough'] }), path).toEqual(required)
      expect(await send('POST', path, { token: 'abc', password: 'short' }), path)
        .toEqual({ status: 400, message: 'Password must be at least 8 characters' })
    }
    expect((await send('POST', '/auth/setup-account', { token: 'abc', password: 'longenough', name: 5 })).status).toBe(400)
  })

  describe('signed in', () => {
    let user: TestUser
    beforeAll(async () => {
      user = await registerTestUser()
    })

    it('password change refuses a non-string password', async () => {
      const required = { status: 400, message: 'Current password and new password are required' }
      expect(await send('PUT', '/api/user/password', { currentPassword: 1, newPassword: 'longenough' }, user.headers)).toEqual(required)
      expect(await send('PUT', '/api/user/password', { currentPassword: 'x', newPassword: null }, user.headers)).toEqual(required)
      expect(await send('PUT', '/api/user/password', { currentPassword: 'x', newPassword: 'short' }, user.headers))
        .toEqual({ status: 400, message: 'New password must be at least 8 characters' })
    })

    it('account deletion refuses a non-string password', async () => {
      expect(await send('DELETE', '/api/user/account', { password: 12345678 }, user.headers))
        .toEqual({ status: 400, message: 'Password is required' })
      expect(await send('DELETE', '/api/user/account', undefined, user.headers)).toMatchObject({ status: 400 })
    })

    it('token creation refuses a non-string name and a non-numeric expiry', async () => {
      expect(await send('POST', '/api/user/tokens', { name: 7 }, user.headers)).toEqual({ status: 400, message: 'Token name is required' })
      expect(await send('POST', '/api/user/tokens', { name: '   ' }, user.headers)).toEqual({ status: 400, message: 'Token name is required' })
      expect(await send('POST', '/api/user/tokens', { name: 'CI', expiresInDays: '30' }, user.headers))
        .toEqual({ status: 400, message: 'Expiry must be a positive number of days' })
      expect(await send('POST', '/api/user/tokens', { name: 'CI', expiresInDays: -1 }, user.headers))
        .toEqual({ status: 400, message: 'Expiry must be a positive number of days' })
      // null means no expiry, as leaving it out does.
      expect((await send('POST', '/api/user/tokens', { name: 'No expiry', expiresInDays: null }, user.headers)).status).toBe(200)
    })
  })

  it('agent token creation refuses the same malformed bodies', async () => {
    const admin = await createAdminUser()
    const agent = await createTestAgent(admin)
    const path = `/api/agents/${agent.id}/tokens`
    expect(await send('POST', path, { name: ['x'] }, admin.headers)).toEqual({ status: 400, message: 'Token name is required' })
    expect(await send('POST', path, { name: 'x', expiresInDays: 'soon' }, admin.headers))
      .toEqual({ status: 400, message: 'Expiry must be a positive number of days' })
    expect((await send('POST', path, { name: 'ok' }, admin.headers)).status).toBe(201)
  })
})
