import { describe, it, expect } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'

describe('POST /auth/register', async () => {
  it('registers a new user and returns verification-required response', async () => {
    const email = `reg-${Date.now()}@test.com`
    const res = await fetch(url('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New User', email, password: 'password123' })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requiresVerification).toBe(true)
    expect(body.message).toContain('verify')
    expect(body.user.email).toBe(email)
    expect(body.user.id).toBeTruthy()

    // Should NOT have a session cookie
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeFalsy()
  })

  it('rejects registration without required fields', async () => {
    await expectError($fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Missing Fields' }
    }), 400)
  })

  it('rejects short passwords', async () => {
    await expectError($fetch('/auth/register', {
      method: 'POST',
      body: { name: 'Short Pass', email: `short-${Date.now()}@test.com`, password: '12345' }
    }), 400)
  })

  it('returns same response for duplicate email (anti-enumeration)', async () => {
    const email = `dup-${Date.now()}@test.com`
    await $fetch('/auth/register', {
      method: 'POST',
      body: { name: 'First', email, password: 'password123' }
    })

    // Second registration with same email should return 200 with same shape
    // to prevent email enumeration (no 400 error)
    const res = await fetch(url('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second', email, password: 'password456' })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requiresVerification).toBe(true)
    expect(body.message).toContain('verify')
    // Should NOT include user object (no account was actually created)
    expect(body.user).toBeUndefined()
  })
})
