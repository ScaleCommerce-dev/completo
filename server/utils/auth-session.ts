import type { H3Event } from 'h3'
import { eq, and } from 'drizzle-orm'

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
 * Look up an email token and its associated user, for one specific purpose.
 *
 * `purpose` is required, and not merely cosmetic: every flow writes to this one table, so
 * before it existed each consumer accepted any live row. A "verify your email" token could be
 * POSTed to /auth/reset-password to set an attacker-chosen password — and that endpoint signs
 * the caller in — so read access to a single message meant account takeover. A mismatch is
 * reported as an invalid link rather than "wrong kind of link": the caller supplied a token
 * they were never meant to use here, and naming the difference only helps them.
 *
 * Throws on an unknown, wrong-purpose, or expired token, or a missing user.
 */
export function lookupVerificationToken(
  token: string,
  purpose: 'verify' | 'reset' | 'setup',
  label = 'link'
) {
  const tokenRow = db.select()
    .from(schema.emailVerificationTokens)
    .where(and(
      eq(schema.emailVerificationTokens.token, token),
      eq(schema.emailVerificationTokens.purpose, purpose)
    ))
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
