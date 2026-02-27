import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

interface ResolvedUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  colorMode: string | null
  isAdmin: boolean
}

interface AuthResult {
  user: ResolvedUser
  authMethod: 'session' | 'token'
}

export async function resolveAuth(event: H3Event): Promise<AuthResult> {
  const authHeader = getRequestHeader(event, 'authorization')

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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        colorMode: user.colorMode,
        isAdmin: !!user.isAdmin
      },
      authMethod: 'token'
    }
  }

  const session = await requireUserSession(event)
  const sessionUser = session.user as ResolvedUser

  // Re-fetch isAdmin from DB to prevent stale session privilege escalation
  const freshUser = db.select({ isAdmin: schema.users.isAdmin })
    .from(schema.users)
    .where(eq(schema.users.id, sessionUser.id))
    .get()

  return {
    user: {
      ...sessionUser,
      isAdmin: !!freshUser?.isAdmin
    },
    authMethod: 'session'
  }
}
