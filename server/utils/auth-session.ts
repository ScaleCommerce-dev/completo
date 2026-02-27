import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'

interface SessionUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  colorMode: string | null
  isAdmin: boolean
}

/**
 * Build a session user object from a DB user row.
 * Accepts optional overrides for fields like avatarUrl (OAuth) or name (setup).
 */
export function buildSessionUser(
  user: { id: string, email: string, name: string, avatarUrl: string | null, colorMode: string | null, isAdmin: number | boolean | null },
  overrides?: Partial<Pick<SessionUser, 'name' | 'avatarUrl' | 'colorMode' | 'isAdmin'>>
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: overrides?.name ?? user.name,
    avatarUrl: overrides?.avatarUrl !== undefined ? overrides.avatarUrl : user.avatarUrl,
    colorMode: overrides?.colorMode !== undefined ? overrides.colorMode : user.colorMode,
    isAdmin: overrides?.isAdmin !== undefined ? overrides.isAdmin : !!user.isAdmin
  }
}

/**
 * Set the user session with a consistent session shape.
 */
export async function setAuthSession(
  event: H3Event,
  user: { id: string, email: string, name: string, avatarUrl: string | null, colorMode: string | null, isAdmin: number | boolean | null },
  overrides?: Partial<Pick<SessionUser, 'name' | 'avatarUrl' | 'colorMode' | 'isAdmin'>>
) {
  await setUserSession(event, { user: buildSessionUser(user, overrides) })
}

/**
 * Throw 403 if user is suspended.
 */
export function ensureNotSuspended(user: { suspendedAt: Date | null }) {
  if (user.suspendedAt) {
    throw createError({ statusCode: 403, message: 'Your account has been suspended' })
  }
}

/**
 * Look up an email verification token and its associated user.
 * Throws on invalid/expired token or missing user.
 */
export function lookupVerificationToken(token: string, label = 'link') {
  const tokenRow = db.select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.token, token))
    .get()

  if (!tokenRow) {
    throw createError({ statusCode: 400, message: `Invalid or expired ${label}` })
  }

  if (tokenRow.expiresAt < new Date()) {
    throw createError({ statusCode: 400, message: `This ${label} has expired` })
  }

  const user = db.select()
    .from(schema.users)
    .where(eq(schema.users.id, tokenRow.userId))
    .get()

  if (!user) {
    throw createError({ statusCode: 400, message: `Invalid or expired ${label}` })
  }

  return { tokenRow, user }
}
