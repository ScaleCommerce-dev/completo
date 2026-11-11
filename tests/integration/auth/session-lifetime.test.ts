import { describe, it, expect } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createTestToken } from '../../setup/auth'

/** Sign in and return the session cookie and its Set-Cookie header. */
async function signIn(email: string, password: string) {
  const res = await fetch(url('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  expect(res.status).toBe(200)
  const setCookie = res.headers.get('set-cookie') || ''
  return { cookie: setCookie.split(';')[0]!, setCookie }
}

const projectsStatus = async (cookie: string) => (await fetch(url('/api/projects'), { headers: { cookie } })).status

describe('session lifetime', () => {
  it('expires the cookie 30 days after sign-in by default', async () => {
    const user = await registerTestUser({ password: 'lifetime-pass' })
    const before = Date.now()
    const { setCookie } = await signIn(user.email, 'lifetime-pass')
    const expires = /Expires=([^;]+)/i.exec(setCookie)?.[1]
    expect(expires).toBeTruthy()
    const days = (new Date(expires!).getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})

/**
 * A sealed cookie lives on the client, so before session versions a password reset
 * or change left every other sign-in working — including one a past holder of the
 * password had open.
 */
describe('ending other sessions', () => {
  it('a password reset ends every session and signs the resetter in fresh', async () => {
    const user = await registerTestUser({ password: 'old-pass-123' })
    const other = await signIn(user.email, 'old-pass-123')
    expect(await projectsStatus(other.cookie)).toBe(200)

    await $fetch('/auth/forgot-password', { method: 'POST', body: { email: user.email } })
    const { token } = await $fetch<{ token: string }>(`/api/_test/get-verification-token?userId=${user.id}`)
    const res = await fetch(url('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'new-pass-123' })
    })
    expect(res.status).toBe(200)
    const fresh = (res.headers.get('set-cookie') || '').split(';')[0]!

    expect(await projectsStatus(other.cookie)).toBe(401)
    expect(await projectsStatus(user.cookie)).toBe(401)
    expect(await projectsStatus(fresh)).toBe(200)
  })

  it('a password change ends every other session and keeps the changer signed in', async () => {
    const user = await registerTestUser({ password: 'old-pass-123' })
    const other = await signIn(user.email, 'old-pass-123')

    const res = await fetch(url('/api/user/password'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'cookie': user.cookie },
      body: JSON.stringify({ currentPassword: 'old-pass-123', newPassword: 'new-pass-123' })
    })
    expect(res.status).toBe(200)
    const fresh = (res.headers.get('set-cookie') || '').split(';')[0]!

    expect(await projectsStatus(other.cookie)).toBe(401)
    expect(await projectsStatus(fresh)).toBe(200)
  })

  it('a password change over an API token ends the sessions but not the token', async () => {
    const user = await registerTestUser({ password: 'old-pass-123' })
    const token = await createTestToken(user)

    const res = await fetch(url('/api/user/password'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...token.headers },
      body: JSON.stringify({ currentPassword: 'old-pass-123', newPassword: 'new-pass-123' })
    })
    expect(res.status).toBe(200)

    expect(await projectsStatus(user.cookie)).toBe(401)
    expect((await fetch(url('/api/projects'), { headers: token.headers })).status).toBe(200)
  })
})
