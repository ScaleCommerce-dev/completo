import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'

/**
 * Suspension must hold for a cookie that was live when it happened. The sealed
 * cookie never expires on its own, so the database read in requireActiveSession is
 * the only thing standing between it and the API — and the middleware's token skip
 * once let `Bearer dzox` (no token branch matches it) fall through to the cookie
 * with no suspension check at all.
 */
describe('suspended user with a live session cookie', () => {
  let admin: TestUser
  let target: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    target = await registerTestUser()
    await $fetch(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { suspended: true }, headers: admin.headers })
  })

  for (const auth of [undefined, 'Bearer dzox', 'Bearer dzo', 'Bearer dzoa', 'Bearer nonsense']) {
    it(`gets 403 with Authorization: ${auth ?? '(none)'}`, async () => {
      const headers: Record<string, string> = { ...target.headers }
      if (auth) headers.authorization = auth
      const res = await fetch(url('/api/projects'), { headers })
      expect(res.status).toBe(403)
    })
  }

  it('cannot mint an API token on a session-only route', async () => {
    const res = await fetch(url('/api/user/tokens'), {
      method: 'POST',
      headers: { ...target.headers, 'content-type': 'application/json', 'authorization': 'Bearer dzox' },
      body: JSON.stringify({ name: 'after suspension' })
    })
    expect(res.status).toBe(403)
  })

  it('a suspended admin loses the admin API', async () => {
    const other = await createAdminUser()
    await $fetch(`/api/admin/users/${other.id}`, { method: 'PATCH', body: { suspended: true }, headers: admin.headers })
    const res = await fetch(url('/api/admin/users'), { headers: { ...other.headers, authorization: 'Bearer dzox' } })
    expect(res.status).toBe(403)
  })
})

describe('deleted user with a live session cookie', () => {
  it('gets 401', async () => {
    const user = await registerTestUser({ password: 'deleteMe123' })
    // `user.headers` keeps the cookie as it was before deletion, as a stolen or
    // still-open tab would.
    await $fetch('/api/user/account', { method: 'DELETE', headers: user.headers, body: { password: 'deleteMe123' } })
    for (const headers of [user.headers, { ...user.headers, authorization: 'Bearer dzox' }]) {
      const res = await fetch(url('/api/projects'), { headers })
      expect(res.status).toBe(401)
    }
  })
})
