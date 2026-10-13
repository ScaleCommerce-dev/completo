/**
 * The OAuth 2.1 authorization server behind the MCP endpoint.
 *
 * Why it exists: a claude.ai Team connector is added once by an owner, and its
 * request headers are shared by everyone who uses it. The only way for each
 * member's calls to run as that member is for Claude to sign them in, which is
 * this: authorization code with PKCE (S256 only), refresh tokens that rotate on
 * every use, dynamic client registration, and client metadata documents for a
 * client that identifies itself by URL. The single protected resource is the
 * MCP URL, so `resource` is checked against that and nothing else.
 *
 * Boundaries that each close a known attack, so a change here owes a test:
 * - `redirect_uri` is an exact string match against the registration. A prefix
 *   or host match lets a registered `https://x/cb` be turned into `https://x/cb?..`
 *   on an attacker's path.
 * - A code is deleted on first read, before any check, so a replayed code and a
 *   code whose exchange failed are equally gone.
 * - Refresh and revocation verify the client that holds the token is the one
 *   the grant was issued to; a public client has no secret, so this is the only
 *   thing binding a stolen refresh token to its origin.
 * - A metadata-document client must be `https`, have a path, and declare its
 *   own URL as `client_id`; the server never fetches a bare host or an IP.
 *
 * Tokens are opaque random strings with a prefix that says what they are
 * (`dzoa_` access, `dzor_` refresh, `dzos_` client secret); `resolveAuth`
 * routes on the prefix. Only hashes are stored.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

export const ACCESS_TOKEN_PREFIX = 'dzoa_'
export const REFRESH_TOKEN_PREFIX = 'dzor_'
const CLIENT_SECRET_PREFIX = 'dzos_'
const CLIENT_ID_PREFIX = 'dzoc_'

/** An hour: long enough for a working session, short enough that revoking a grant bites soon. */
export const ACCESS_TOKEN_TTL_S = 60 * 60
/** Thirty days of not using the connector before Claude has to sign in again. */
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60
/** The spec's ceiling for a code; consent to exchange is seconds in practice. */
const CODE_TTL_S = 10 * 60

const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const
type AuthMethod = typeof AUTH_METHODS[number]

export class OAuthError extends Error {
  constructor(
    public readonly error: string,
    description: string,
    public readonly status = 400,
    /** False when the client or its redirect URI is in doubt, so the error is shown, never sent to the URI. */
    public readonly redirectable = true
  ) {
    super(description)
  }
}

export interface OAuthClient {
  id: string
  name: string
  redirectUris: string[]
  authMethod: AuthMethod
  secretHash: string | null
}

// ─── Origins and tokens ──────────────────────────────────────────────────────

/** The URL the outside world uses, from APP_URL when set (same source as emailed links), else the request. */
export function publicOrigin(event: H3Event): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  const { protocol, host } = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return `${protocol}//${host}`
}

export function mcpResource(event: H3Event): string {
  return `${publicOrigin(event)}/mcp`
}

export function randomToken(prefix = ''): string {
  return prefix + randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function seconds(fromNow: number): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000 + fromNow * 1000)
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/** `https://…`, or `http://` on the loopback only, which is where a desktop client listens for its callback. */
export function isAcceptableRedirectUri(uri: string): boolean {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.hash) return false
  if (u.protocol === 'https:') return true
  return u.protocol === 'http:' && isLoopback(u.hostname)
}

export function registerClient(input: {
  name?: unknown
  redirectUris?: unknown
  authMethod?: unknown
}): { client: OAuthClient, secret: string | null } {
  const uris = Array.isArray(input.redirectUris) ? input.redirectUris : []
  if (!uris.length || !uris.every(u => typeof u === 'string' && isAcceptableRedirectUri(u))) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be https URLs, or http on localhost, without a fragment')
  }
  const method = input.authMethod === undefined ? 'none' : input.authMethod
  if (!AUTH_METHODS.includes(method as AuthMethod)) {
    throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}`)
  }
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 100) : 'MCP client'
  const secret = method === 'none' ? null : randomToken(CLIENT_SECRET_PREFIX)
  const client: OAuthClient = {
    id: randomToken(CLIENT_ID_PREFIX),
    name,
    redirectUris: uris as string[],
    authMethod: method as AuthMethod,
    secretHash: secret ? hashToken(secret) : null
  }
  db.insert(schema.oauthClients).values({
    id: client.id,
    name: client.name,
    redirectUris: JSON.stringify(client.redirectUris),
    tokenEndpointAuthMethod: client.authMethod,
    clientSecretHash: client.secretHash
  }).run()
  return { client, secret }
}

const metadataCache = new Map<string, { client: OAuthClient, at: number }>()
const METADATA_TTL_MS = 60 * 60 * 1000

/** A client that is its own metadata document (OAuth Client ID Metadata Documents). */
async function fetchMetadataClient(clientId: string): Promise<OAuthClient> {
  const cached = metadataCache.get(clientId)
  if (cached && Date.now() - cached.at < METADATA_TTL_MS) return cached.client

  let u: URL
  try {
    u = new URL(clientId)
  } catch {
    throw new OAuthError('invalid_client', 'Unknown client', 401, false)
  }
  if (u.protocol !== 'https:' || u.pathname === '/' || !u.pathname || u.hash || u.username
    || isLoopback(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) {
    throw new OAuthError('invalid_client', 'A client metadata URL must be https with a path', 401, false)
  }

  let doc: Record<string, unknown> | undefined
  try {
    doc = await $fetch<Record<string, unknown>>(clientId, { timeout: 5000, headers: { accept: 'application/json' } })
  } catch {
    // Unreachable, slow or not JSON: all the same answer below.
  }
  if (!doc || typeof doc !== 'object' || doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) {
    throw new OAuthError('invalid_client', 'Client metadata document is missing or does not name itself', 401, false)
  }
  const redirectUris = doc.redirect_uris.filter((r): r is string => typeof r === 'string' && isAcceptableRedirectUri(r))
  if (!redirectUris.length) {
    throw new OAuthError('invalid_client', 'Client metadata document has no acceptable redirect_uris', 401, false)
  }
  const client: OAuthClient = {
    id: clientId,
    name: typeof doc.client_name === 'string' && doc.client_name.trim() ? doc.client_name.trim().slice(0, 100) : u.hostname,
    redirectUris,
    authMethod: 'none',
    secretHash: null
  }
  metadataCache.set(clientId, { client, at: Date.now() })
  return client
}

export async function resolveClient(clientId: unknown): Promise<OAuthClient> {
  if (typeof clientId !== 'string' || !clientId) {
    throw new OAuthError('invalid_client', 'client_id is required', 401, false)
  }
  if (clientId.startsWith('https://')) return fetchMetadataClient(clientId)
  const row = db.select().from(schema.oauthClients).where(eq(schema.oauthClients.id, clientId)).get()
  if (!row) throw new OAuthError('invalid_client', 'Unknown client', 401, false)
  return {
    id: row.id,
    name: row.name,
    redirectUris: safeParseJson<string[]>(row.redirectUris, []),
    authMethod: row.tokenEndpointAuthMethod as AuthMethod,
    secretHash: row.clientSecretHash
  }
}

/** Client authentication at the token and revocation endpoints: Basic header or body, secret required when one was issued. */
export async function authenticateClient(event: H3Event, body: Record<string, unknown>): Promise<OAuthClient> {
  let basicId: string | undefined
  let basicSecret: string | undefined
  const header = getRequestHeader(event, 'authorization')
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const at = decoded.indexOf(':')
    if (at > 0) {
      basicId = decodeURIComponent(decoded.slice(0, at))
      basicSecret = decodeURIComponent(decoded.slice(at + 1))
    }
  }
  const client = await resolveClient(basicId ?? body.client_id)
  if (client.secretHash) {
    const secret = basicSecret ?? (typeof body.client_secret === 'string' ? body.client_secret : '')
    if (!secret || !safeEqual(hashToken(secret), client.secretHash)) {
      throw new OAuthError('invalid_client', 'Client authentication failed', 401, false)
    }
  }
  return client
}

// ─── Authorization request and code ──────────────────────────────────────────

export interface AuthorizeRequest {
  client: OAuthClient
  redirectUri: string
  state: string | null
  codeChallenge: string
  resource: string | null
}

function normaliseResource(r: string): string {
  return r.trim().replace(/\/+$/, '')
}

/** Checks everything the consent page and the approval share. Order matters: the client and URI are settled before anything is redirectable. */
export async function parseAuthorizeRequest(event: H3Event, q: Record<string, unknown>): Promise<AuthorizeRequest> {
  const client = await resolveClient(q.client_id)
  const redirectUri = typeof q.redirect_uri === 'string' ? q.redirect_uri : ''
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client', 400, false)
  }
  if (q.response_type !== 'code') {
    throw new OAuthError('unsupported_response_type', 'response_type must be "code"')
  }
  const codeChallenge = typeof q.code_challenge === 'string' ? q.code_challenge : ''
  if (!codeChallenge || q.code_challenge_method !== 'S256') {
    throw new OAuthError('invalid_request', 'code_challenge with code_challenge_method=S256 is required')
  }
  let resource: string | null = null
  if (typeof q.resource === 'string' && q.resource) {
    resource = normaliseResource(q.resource)
    if (resource !== mcpResource(event)) {
      throw new OAuthError('invalid_target', `resource must be ${mcpResource(event)}`)
    }
  }
  return {
    client,
    redirectUri,
    state: typeof q.state === 'string' && q.state ? q.state : null,
    codeChallenge,
    resource
  }
}

export function issueCode(userId: string, req: AuthorizeRequest): string {
  const code = randomToken()
  db.insert(schema.oauthCodes).values({
    codeHash: hashToken(code),
    clientId: req.client.id,
    userId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    resource: req.resource,
    expiresAt: seconds(CODE_TTL_S)
  }).run()
  return code
}

/** Where to send the browser after consent: the redirect URI with the outcome in its query. */
export function redirectWith(redirectUri: string, params: Record<string, string | null>): string {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) {
    if (v !== null) u.searchParams.set(k, v)
  }
  return u.toString()
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  return safeEqual(computed, challenge)
}

// ─── Grants ──────────────────────────────────────────────────────────────────

interface IssuedTokens {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
}

function issuedTokens(access: string, refresh: string): IssuedTokens {
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh }
}

/** Spend a code for a grant. Every failure is `invalid_grant` by design: the client learns nothing about which check failed. */
export function exchangeCode(event: H3Event, client: OAuthClient, body: Record<string, unknown>): IssuedTokens {
  const code = typeof body.code === 'string' ? body.code : ''
  const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : ''
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : ''
  if (!code || !verifier) {
    throw new OAuthError('invalid_request', 'code and code_verifier are required')
  }
  const codeHash = hashToken(code)
  const row = db.select().from(schema.oauthCodes).where(eq(schema.oauthCodes.codeHash, codeHash)).get()
  if (row) db.delete(schema.oauthCodes).where(eq(schema.oauthCodes.codeHash, codeHash)).run()
  if (!row || row.expiresAt.getTime() < Date.now() || row.clientId !== client.id || row.redirectUri !== redirectUri
    || !pkceMatches(verifier, row.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'The authorization code is invalid, expired, or was issued to another client')
  }
  if (typeof body.resource === 'string' && body.resource && normaliseResource(body.resource) !== mcpResource(event)) {
    throw new OAuthError('invalid_target', `resource must be ${mcpResource(event)}`)
  }
  const access = randomToken(ACCESS_TOKEN_PREFIX)
  const refresh = randomToken(REFRESH_TOKEN_PREFIX)
  db.insert(schema.oauthGrants).values({
    userId: row.userId,
    clientId: client.id,
    clientName: client.name,
    accessTokenHash: hashToken(access),
    accessExpiresAt: seconds(ACCESS_TOKEN_TTL_S),
    refreshTokenHash: hashToken(refresh),
    refreshExpiresAt: seconds(REFRESH_TOKEN_TTL_S),
    resource: row.resource
  }).run()
  return issuedTokens(access, refresh)
}

/** Rotate a grant's pair. The old refresh token stops working the moment the new one is issued. */
export function refreshGrant(client: OAuthClient, body: Record<string, unknown>): IssuedTokens {
  const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : ''
  if (!refresh) throw new OAuthError('invalid_request', 'refresh_token is required')
  const grant = db.select().from(schema.oauthGrants).where(eq(schema.oauthGrants.refreshTokenHash, hashToken(refresh))).get()
  if (!grant || grant.clientId !== client.id || grant.refreshExpiresAt.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'The refresh token is invalid, expired, or was issued to another client')
  }
  const access = randomToken(ACCESS_TOKEN_PREFIX)
  const nextRefresh = randomToken(REFRESH_TOKEN_PREFIX)
  db.update(schema.oauthGrants).set({
    accessTokenHash: hashToken(access),
    accessExpiresAt: seconds(ACCESS_TOKEN_TTL_S),
    refreshTokenHash: hashToken(nextRefresh),
    refreshExpiresAt: seconds(REFRESH_TOKEN_TTL_S)
  }).where(eq(schema.oauthGrants.id, grant.id)).run()
  return issuedTokens(access, nextRefresh)
}

/** Revoke by either token of the pair. Silent when nothing matches, as the spec asks. */
export function revokeToken(client: OAuthClient, token: string): void {
  const hash = hashToken(token)
  const column = token.startsWith(REFRESH_TOKEN_PREFIX) ? schema.oauthGrants.refreshTokenHash : schema.oauthGrants.accessTokenHash
  const grant = db.select().from(schema.oauthGrants).where(eq(column, hash)).get()
  if (grant && grant.clientId === client.id) {
    db.delete(schema.oauthGrants).where(eq(schema.oauthGrants.id, grant.id)).run()
  }
}

/** The grant behind a bearer access token, for `resolveAuth`. */
export function findGrantByAccessToken(raw: string) {
  return db.select().from(schema.oauthGrants).where(eq(schema.oauthGrants.accessTokenHash, hashToken(raw))).get()
}

/** The JSON body and status an OAuth endpoint answers an error with. */
export function sendOAuthError(event: H3Event, err: unknown) {
  if (!(err instanceof OAuthError)) throw err
  setResponseStatus(event, err.status)
  if (err.status === 401) setResponseHeader(event, 'www-authenticate', 'Basic realm="completo"')
  return { error: err.error, error_description: err.message }
}
