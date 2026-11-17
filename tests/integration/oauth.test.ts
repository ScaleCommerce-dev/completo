import { createHash, randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { url, $fetch } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'

/**
 * The OAuth flow as an MCP client walks it: discovery, registration, consent,
 * code exchange with PKCE, a call to /mcp with the result, refresh, revoke.
 * Each boundary in `oauth-server.ts`'s header comment has a test here.
 */

const REDIRECT = 'https://client.example/callback'

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function register(body: Record<string, unknown> = {}) {
  const res = await fetch(url('/oauth/register'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Test MCP client', redirect_uris: [REDIRECT], ...body })
  })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

/** Consent as the signed-in user; returns the code the client would receive. */
async function consent(user: TestUser, params: Record<string, string>, decision = 'allow') {
  const { redirectTo } = await $fetch<{ redirectTo: string }>('/api/oauth/authorize', {
    method: 'POST',
    body: { response_type: 'code', code_challenge_method: 'S256', decision, ...params },
    headers: user.headers
  })
  return new URL(redirectTo)
}

async function token(body: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(url('/oauth/token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString()
  })
  return { status: res.status, headers: res.headers, body: await res.json() as Record<string, unknown> }
}

async function mcp(accessToken: string) {
  return fetch(url('/mcp'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } })
  })
}

/** Register, consent and exchange in one go: the happy path every later test starts from. */
async function signIn(user: TestUser) {
  const { body: client } = await register()
  const { verifier, challenge } = pkce()
  const cb = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge, state: 's' })
  const exchanged = await token({
    grant_type: 'authorization_code',
    code: cb.searchParams.get('code')!,
    redirect_uri: REDIRECT,
    client_id: client.client_id as string,
    code_verifier: verifier
  })
  expect(exchanged.status).toBe(200)
  return { client, tokens: exchanged.body as { access_token: string, refresh_token: string } }
}

describe('OAuth for MCP', () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('publishes discovery documents that point at each other', async () => {
    const as = await $fetch<Record<string, unknown>>('/.well-known/oauth-authorization-server')
    expect(as.authorization_endpoint).toBe(url('/oauth/authorize'))
    expect(as.token_endpoint).toBe(url('/oauth/token'))
    expect(as.registration_endpoint).toBe(url('/oauth/register'))
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    expect(as.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])

    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const prm = await $fetch<Record<string, unknown>>(path)
      expect(prm.resource).toBe(url('/mcp'))
      expect(prm.authorization_servers).toEqual([as.issuer])
    }
  })

  it('sends an unauthenticated MCP client to the metadata', async () => {
    const res = await fetch(url('/mcp'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${url('/.well-known/oauth-protected-resource/mcp')}"`)
  })

  it('registers public clients, and confidential ones with a secret', async () => {
    const pub = await register()
    expect(pub.status).toBe(201)
    expect(pub.body.client_id).toMatch(/^dzoc_/)
    expect(pub.body.client_secret).toBeUndefined()
    expect(pub.body.token_endpoint_auth_method).toBe('none')

    const conf = await register({ token_endpoint_auth_method: 'client_secret_post' })
    expect(conf.status).toBe(201)
    expect(conf.body.client_secret).toMatch(/^dzos_/)
  })

  it('refuses redirect URIs that are not https or loopback', async () => {
    expect((await register({ redirect_uris: ['http://evil.example/cb'] })).status).toBe(400)
    expect((await register({ redirect_uris: [] })).status).toBe(400)
    expect((await register({ redirect_uris: ['https://x.example/cb#frag'] })).status).toBe(400)
    expect((await register({ redirect_uris: ['http://localhost:9000/cb'] })).status).toBe(201)
  })

  it('limits what an anonymous registration may store', async () => {
    // Registration is open to anyone, and had no limit: each POST could store megabytes.
    const many = Array.from({ length: 11 }, (_, i) => `https://client.example/cb${i}`)
    expect((await register({ redirect_uris: many })).status).toBe(400)
    expect((await register({ redirect_uris: [`https://client.example/${'a'.repeat(2100)}`] })).status).toBe(400)

    const huge = await fetch(url('/oauth/register'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'x', redirect_uris: [REDIRECT], padding: 'a'.repeat(20 * 1024) })
    })
    expect(huge.status).toBe(413)
  })

  it('prunes old registrations nobody consented to, and keeps the ones in use', async () => {
    // Unknown client: 401 invalid_client. Known client, bad refresh token: 400 invalid_grant.
    const known = async (clientId: string) =>
      (await token({ grant_type: 'refresh_token', client_id: clientId, refresh_token: 'dzor_nope' })).status !== 401

    const { body: unused } = await register()
    const { body: pending } = await register()
    const { challenge } = pkce()
    await consent(user, { client_id: pending.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge, state: 's' })
    const { client: granted } = await signIn(user)
    for (const c of [unused, pending, granted]) {
      await $fetch('/api/_test/set-oauth-client-created-at', { method: 'POST', body: { clientId: c.client_id, daysAgo: 8 } })
    }

    expect((await register()).status).toBe(201)
    expect(await known(unused.client_id as string)).toBe(false)
    expect(await known(pending.client_id as string)).toBe(true)
    expect(await known(granted.client_id as string)).toBe(true)
  })

  it('tells the consent page where the code goes, apart from the name the client chose', async () => {
    // Anyone can register as "Claude"; the redirect host is what the page leads with.
    const { body: client } = await register({ client_name: 'Claude', redirect_uris: ['https://evil.example/cb'] })
    const { challenge } = pkce()
    const info = await $fetch<Record<string, unknown>>('/api/oauth/authorize', {
      query: { response_type: 'code', client_id: client.client_id as string, redirect_uri: 'https://evil.example/cb', code_challenge: challenge, code_challenge_method: 'S256', state: 's' },
      headers: user.headers
    })
    expect(info).toMatchObject({ clientName: 'Claude', redirectHost: 'evil.example', clientHost: null })
  })

  it('shows the consent page only to a signed-in user, for a registered redirect', async () => {
    const { body: client } = await register()
    const { challenge } = pkce()
    const query = { client_id: client.client_id as string, redirect_uri: REDIRECT, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' }

    const anon = await fetch(url('/api/oauth/authorize?' + new URLSearchParams(query)))
    expect(anon.status).toBe(401)

    const info = await $fetch<{ clientName: string, redirectHost: string }>('/api/oauth/authorize', { query, headers: user.headers })
    expect(info.clientName).toBe('Test MCP client')
    expect(info.redirectHost).toBe('client.example')

    const wrongUri = await fetch(url('/api/oauth/authorize?' + new URLSearchParams({ ...query, redirect_uri: 'https://client.example/callback?x=1' })), { headers: user.headers })
    expect(wrongUri.status).toBe(400)
  })

  it('carries deny and a bad challenge back to the client with its state', async () => {
    const { body: client } = await register()
    const denied = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: pkce().challenge, state: 'xyz' }, 'deny')
    expect(denied.searchParams.get('error')).toBe('access_denied')
    expect(denied.searchParams.get('state')).toBe('xyz')
    expect(denied.searchParams.get('code')).toBeNull()

    const plain = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: 'abc', code_challenge_method: 'plain', state: 'xyz' })
    expect(plain.searchParams.get('error')).toBe('invalid_request')
    expect(plain.searchParams.get('state')).toBe('xyz')
  })

  it('exchanges a code once, for the right client, URI and verifier', async () => {
    const { body: client } = await register()
    const { verifier, challenge } = pkce()
    const cb = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge, state: 'abc' })
    expect(cb.origin + cb.pathname).toBe(REDIRECT)
    expect(cb.searchParams.get('state')).toBe('abc')
    const code = cb.searchParams.get('code')!
    const base = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: client.client_id as string }

    const wrongVerifier = await token({ ...base, code_verifier: pkce().verifier })
    expect(wrongVerifier.status).toBe(400)
    expect(wrongVerifier.body.error).toBe('invalid_grant')

    // The failed attempt spent the code: a replay with the right verifier is gone too.
    const replay = await token({ ...base, code_verifier: verifier })
    expect(replay.body.error).toBe('invalid_grant')

    const { body: other } = await register()
    const cb2 = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge })
    const otherClient = await token({ ...base, code: cb2.searchParams.get('code')!, client_id: other.client_id as string, code_verifier: verifier })
    expect(otherClient.body.error).toBe('invalid_grant')

    const cb3 = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge })
    const ok = await token({ ...base, code: cb3.searchParams.get('code')!, code_verifier: verifier, resource: url('/mcp') })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(ok.body.token_type).toBe('Bearer')
    expect(ok.body.expires_in).toBe(3600)
    expect(ok.body.access_token).toMatch(/^dzoa_/)
    expect(ok.body.refresh_token).toMatch(/^dzor_/)
  })

  it('rejects a resource that is not the MCP endpoint', async () => {
    const { body: client } = await register()
    const { verifier, challenge } = pkce()
    const cb = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge, resource: 'https://other.example/mcp' })
    expect(cb.searchParams.get('error')).toBe('invalid_target')

    const cb2 = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge })
    const res = await token({ grant_type: 'authorization_code', code: cb2.searchParams.get('code')!, redirect_uri: REDIRECT, client_id: client.client_id as string, code_verifier: verifier, resource: 'https://other.example/mcp' })
    expect(res.body.error).toBe('invalid_target')
  })

  it('lets the access token call MCP and the API as the user', async () => {
    const { tokens } = await signIn(user)
    const res = await mcp(tokens.access_token)
    expect(res.status).toBe(200)
    const body = await res.json() as { result: { isError: boolean } }
    expect(body.result.isError).toBe(false)

    const projects = await $fetch<unknown[]>('/api/projects', { headers: { authorization: `Bearer ${tokens.access_token}` } })
    expect(Array.isArray(projects)).toBe(true)
  })

  it('rotates on refresh, binds the refresh token to its client, and retires the old pair', async () => {
    const { client, tokens } = await signIn(user)

    const { body: other } = await register()
    const stolen = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: other.client_id as string })
    expect(stolen.body.error).toBe('invalid_grant')

    const refreshed = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id as string })
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.access_token).not.toBe(tokens.access_token)
    expect(refreshed.body.refresh_token).not.toBe(tokens.refresh_token)

    const old = await mcp(tokens.access_token)
    expect(old.status).toBe(401)
    expect(old.headers.get('www-authenticate')).toContain('error="invalid_token"')
    expect((await mcp(refreshed.body.access_token as string)).status).toBe(200)

    // The old refresh token is spent. Presenting it again also ends the grant (next test).
    const again = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id as string })
    expect(again.body.error).toBe('invalid_grant')
  })

  it('revokes the grant when a used refresh token comes back', async () => {
    // Two holders of one grant: whichever refreshed second shows the token is out.
    const { client, tokens } = await signIn(user)
    const refresh = (t: string) => token({ grant_type: 'refresh_token', refresh_token: t, client_id: client.client_id as string })
    const first = await refresh(tokens.refresh_token)
    expect(first.status).toBe(200)
    const replay = await refresh(tokens.refresh_token)
    expect(replay.body.error).toBe('invalid_grant')
    // The rotated pair died with it, not only the replayed token.
    expect((await refresh(first.body.refresh_token as string)).body.error).toBe('invalid_grant')
    expect((await mcp(first.body.access_token as string)).status).toBe(401)
  })

  it('requires the secret of a confidential client', async () => {
    const { body: client } = await register({ token_endpoint_auth_method: 'client_secret_basic' })
    const { verifier, challenge } = pkce()
    const cb = await consent(user, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge })
    const base = { grant_type: 'authorization_code', code: cb.searchParams.get('code')!, redirect_uri: REDIRECT, code_verifier: verifier }

    const noSecret = await token({ ...base, client_id: client.client_id as string })
    expect(noSecret.status).toBe(401)
    expect(noSecret.body.error).toBe('invalid_client')

    // The code survived: client authentication failed before the code was read.
    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')
    const ok = await token(base, { authorization: `Basic ${basic}` })
    expect(ok.status).toBe(200)
  })

  it('revokes from the client and from the profile page', async () => {
    const a = await signIn(user)
    const revoked = await fetch(url('/oauth/revoke'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: a.tokens.access_token, client_id: a.client.client_id })
    })
    expect(revoked.status).toBe(200)
    expect((await mcp(a.tokens.access_token)).status).toBe(401)

    // The list carries no token, so which row is `b` cannot be told apart from
    // the earlier sign-ins this user made above (same second, same client name).
    // Disconnecting every row is what a user clearing the list does anyway.
    const b = await signIn(user)
    const grants = await $fetch<Array<{ id: string, clientName: string }>>('/api/user/oauth-grants', { headers: user.headers })
    expect(grants.map(g => g.clientName)).toContain('Test MCP client')
    expect(grants.length).toBeGreaterThanOrEqual(1)

    const stranger = await registerTestUser()
    const res = await fetch(url(`/api/user/oauth-grants/${grants[0]!.id}`), { method: 'DELETE', headers: stranger.headers })
    expect(res.status).toBe(404)

    for (const g of grants) {
      await $fetch(`/api/user/oauth-grants/${g.id}`, { method: 'DELETE', headers: user.headers })
    }
    const after = await $fetch<Array<{ id: string }>>('/api/user/oauth-grants', { headers: user.headers })
    expect(after).toEqual([])
    expect((await mcp(b.tokens.access_token)).status).toBe(401)
  })

  it('rejects a metadata-document client that is not https with a path', async () => {
    for (const bad of ['http://client.example/meta.json', 'https://client.example/', 'https://127.0.0.1/meta.json',
      'https://client.example:8443/meta.json', 'https://intranet/meta.json']) {
      const res = await fetch(url('/api/oauth/authorize?' + new URLSearchParams({ client_id: bad, redirect_uri: REDIRECT, response_type: 'code', code_challenge: 'x', code_challenge_method: 'S256' })), { headers: user.headers })
      expect(res.status).toBe(400)
    }
  })

  it('a code issued before a password change does not exchange after it', async () => {
    // The change deletes grants; an unexchanged code would mint a fresh one.
    const password = 'old-password-123'
    const holder = await registerTestUser({ password })
    const { body: client } = await register()
    const { verifier, challenge } = pkce()
    const cb = await consent(holder, { client_id: client.client_id as string, redirect_uri: REDIRECT, code_challenge: challenge, state: 's' })
    const changed = await fetch(url('/api/user/password'), {
      method: 'PUT',
      headers: { ...holder.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, newPassword: 'new-password-456' })
    })
    expect(changed.status).toBe(200)
    const exchanged = await token({
      grant_type: 'authorization_code',
      code: cb.searchParams.get('code')!,
      redirect_uri: REDIRECT,
      client_id: client.client_id as string,
      code_verifier: verifier
    })
    expect(exchanged.status).toBe(400)
    expect(exchanged.body.error).toBe('invalid_grant')
  })
})
