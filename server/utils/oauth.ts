import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

interface OAuthUserInfo {
  email: string
  name: string
  avatarUrl: string | null
  provider: string
}

/**
 * Shared handler for all OAuth providers.
 * Finds or creates a user by email, sets the session, and redirects to /projects.
 * Redirects to /login?error=<code> on failure (suspended, domain-blocked, etc.).
 */
export async function handleOAuthUser(event: H3Event, info: OAuthUserInfo) {
  const email = info.email.toLowerCase()

  const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (existing) {
    if (existing.suspendedAt) {
      return sendRedirect(event, '/login?error=oauth-suspended')
    }

    // Update avatar if the user doesn't have one yet
    const updates: Record<string, unknown> = { lastSeenAt: new Date() }
    if (!existing.avatarUrl && info.avatarUrl) {
      updates.avatarUrl = info.avatarUrl
    }
    db.update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, existing.id))
      .run()

    await setAuthSession(event, existing, { avatarUrl: info.avatarUrl ?? existing.avatarUrl })

    return sendRedirect(event, '/projects')
  }

  // New user — check domain allowlist
  const allowedDomains = getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
  if (allowedDomains.length > 0) {
    const emailDomain = email.split('@')[1]
    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      return sendRedirect(event, '/login?error=oauth-domain')
    }
  }

  // Create new user
  const userId = crypto.randomUUID()
  db.insert(schema.users).values({
    id: userId,
    email,
    name: info.name,
    passwordHash: '!oauth',
    avatarUrl: info.avatarUrl,
    emailVerifiedAt: new Date(),
    lastSeenAt: new Date()
  }).run()

  claimProjectInvitations(email, userId)

  await setAuthSession(event, {
    id: userId,
    email,
    name: info.name,
    avatarUrl: info.avatarUrl,
    colorMode: null,
    isAdmin: false
  })

  return sendRedirect(event, '/projects')
}
