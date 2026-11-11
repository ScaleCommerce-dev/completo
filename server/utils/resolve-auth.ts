import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

interface ResolvedUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  colorMode: string | null
  isAdmin: boolean
  kind: 'human' | 'agent'
  color: string | null
  managedById: string | null
}

interface AuthResult {
  user: ResolvedUser
  authMethod: 'session' | 'token'
}

export async function resolveAuth(event: H3Event): Promise<AuthResult> {
  const authHeader = getRequestHeader(event, 'authorization')

  // An OAuth access token (MCP sign-in). `data.oauth` lets the MCP endpoint
  // say `error="invalid_token"` in WWW-Authenticate, which is what tells a
  // client to refresh rather than start over.
  if (authHeader?.startsWith(`Bearer ${ACCESS_TOKEN_PREFIX}`)) {
    const grant = findGrantByAccessToken(authHeader.slice(7))
    if (!grant) {
      throw createError({ statusCode: 401, message: 'Invalid access token', data: { oauth: 'invalid_token' } })
    }
    if (grant.accessExpiresAt.getTime() < Date.now()) {
      throw createError({ statusCode: 401, message: 'Access token expired', data: { oauth: 'invalid_token' } })
    }
    const user = db.select().from(schema.users).where(eq(schema.users.id, grant.userId)).get()
    if (!user) {
      throw createError({ statusCode: 401, message: 'Invalid access token', data: { oauth: 'invalid_token' } })
    }
    if (user.suspendedAt) {
      throw createError({ statusCode: 403, message: 'Your account has been suspended' })
    }
    const now = new Date()
    db.update(schema.oauthGrants).set({ lastUsedAt: now }).where(eq(schema.oauthGrants.id, grant.id)).run()
    db.update(schema.users).set({ lastSeenAt: now }).where(eq(schema.users.id, user.id)).run()
    return {
      user: tokenUser(user),
      authMethod: 'token'
    }
  }

  if (authHeader?.startsWith('Bearer dzo_')) {
    const rawToken = authHeader.slice(7)
    const tokenHash = hashApiToken(rawToken)

    const tokenRow = db.select()
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenHash, tokenHash))
      .get()

    if (!tokenRow) {
      throw createError({ statusCode: 401, message: 'Invalid API token' })
    }

    if (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) {
      throw createError({ statusCode: 401, message: 'API token has expired' })
    }

    const user = db.select()
      .from(schema.users)
      .where(eq(schema.users.id, tokenRow.userId))
      .get()

    if (!user) {
      throw createError({ statusCode: 401, message: 'Invalid API token' })
    }

    if (user.suspendedAt) {
      throw createError({ statusCode: 403, message: 'Your account has been suspended' })
    }

    const now = new Date()
    db.update(schema.apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(schema.apiTokens.id, tokenRow.id))
      .run()
    db.update(schema.users)
      .set({ lastSeenAt: now })
      .where(eq(schema.users.id, user.id))
      .run()

    return {
      user: tokenUser(user),
      authMethod: 'token'
    }
  }

  const { session, freshUser } = await requireActiveSession(event)
  const sessionUser = session.user as ResolvedUser

  return {
    user: {
      ...sessionUser,
      isAdmin: !!freshUser.isAdmin,
      kind: 'human',
      color: freshUser.color ?? null,
      managedById: null
    },
    authMethod: 'session'
  }
}

/**
 * A cookie session whose user still exists, is human, is not suspended, and was
 * issued since their last password reset or change.
 *
 * The cookie is sealed and lives on the client until its maxAge, so suspending or
 * deleting a user or changing their password invalidates nothing there: this
 * database read is the only thing that does. It used to live only in the `check-suspended` middleware, which skips any
 * request with a `Bearer dzo…` header so that tokens are checked here instead —
 * and `Bearer dzox` matched that skip but neither token branch above, so a
 * suspended user kept full access by adding one header. Every session-only
 * handler goes through this rather than `requireUserSession`, so the check does
 * not depend on any middleware.
 */
export async function requireActiveSession(event: H3Event) {
  const session = await requireUserSession(event)

  // Re-fetch isAdmin from DB to prevent stale session privilege escalation
  const freshUser = db.select({
    isAdmin: schema.users.isAdmin,
    kind: schema.users.kind,
    color: schema.users.color,
    managedById: schema.users.managedById,
    suspendedAt: schema.users.suspendedAt,
    sessionVersion: schema.users.sessionVersion
  })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .get()

  // A deleted user's cookie, or a session naming an agent: every sign-in path
  // refuses an agent, so such a session was not issued by this server as it is now.
  // Or a session from before a password reset or change (setAuthSession stamps the
  // version; a cookie from before versions existed counts as 0, the column default).
  const issuedVersion = typeof session.sessionVersion === 'number' ? session.sessionVersion : 0
  if (!freshUser || freshUser.kind === 'agent' || issuedVersion !== freshUser.sessionVersion) {
    await dropSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (freshUser.suspendedAt) {
    await dropSession(event)
    throw createError({ statusCode: 403, message: 'Your account has been suspended' })
  }

  return { session, freshUser }
}

/**
 * Clear the cookie when the response can still carry it. An SSE stream re-checks
 * auth after its headers went out (see `isStillAuthorized`), where setting a
 * cookie would throw instead of reporting the real reason.
 */
async function dropSession(event: H3Event) {
  if (!event.node.res.headersSent) await clearUserSession(event)
}

/**
 * Re-run authentication for a long-lived response. `resolveAuth` at connect
 * proves who the caller *was*; a stream that outlives a suspension, a deleted
 * token or a removed membership must ask again before it sends anything else.
 * `check` adds the endpoint's own condition (e.g. project membership).
 */
export async function isStillAuthorized(event: H3Event, check?: (user: ResolvedUser) => void): Promise<boolean> {
  try {
    const { user } = await resolveAuth(event)
    check?.(user)
    return true
  } catch {
    return false
  }
}

/**
 * The caller behind a token. An agent is never an admin, whatever its row says:
 * `isAdmin` grants a synthetic owner role on every project, which is exactly the
 * reach agents exist to take away from an instance owner's own token.
 */
function tokenUser(user: typeof schema.users.$inferSelect): ResolvedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    colorMode: user.colorMode,
    isAdmin: user.kind === 'human' && !!user.isAdmin,
    kind: user.kind,
    color: user.color,
    managedById: user.managedById
  }
}
