import { describe, it, expect, beforeAll } from 'vitest'
import { url } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'

/**
 * `server/middleware/same-origin.ts`. A session cookie is `SameSite=Lax`, so a
 * page on a sibling subdomain could send it with a POST; these are the headers
 * a browser attaches that tell the server so.
 */
describe('cross-site requests', () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  // A write with no uniqueness rule, so it can be repeated.
  const post = (headers: Record<string, string>) => fetch(url('/api/user/profile'), {
    method: 'PUT',
    headers: { ...user.headers, 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ name: 'Origin check' })
  })

  it('refuses a write a browser marks as coming from another site, or a sibling subdomain', async () => {
    expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post({ 'sec-fetch-site': 'same-site' })).status).toBe(403)
    expect((await post({ origin: 'https://evil.example' })).status).toBe(403)
    expect((await post({ origin: 'null' })).status).toBe(403)
  })

  it('lets the app itself, and clients that are not browsers, through', async () => {
    expect((await post({ 'sec-fetch-site': 'same-origin' })).status).toBe(200)
    expect((await post({ origin: new URL(url('/')).origin })).status).toBe(200)
    // No browser headers at all: the CLI, MCP clients, this suite.
    expect((await post({})).status).toBe(200)
  })

  it('does not apply to reads, or to the OAuth endpoints meant to be called cross-origin', async () => {
    const read = await fetch(url('/api/user/profile'), { headers: { ...user.headers, 'sec-fetch-site': 'cross-site' } })
    expect(read.status).toBe(200)
    const register = await fetch(url('/oauth/register'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'https://claude.ai', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ client_name: 'Test', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' })
    })
    expect(register.status).not.toBe(403)
  })

  it('keeps every page out of other sites\' frames', async () => {
    const res = await fetch(url('/login'))
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors \'none\'')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })
})
