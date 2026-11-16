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
    // An agent never signs in. Its address is on a reserved TLD no provider can
    // vouch for, but the kind check is the guard, not that.
    if (existing.kind === 'agent') {
      return sendRedirect(event, '/login?error=oauth')
    }
    if (existing.suspendedAt) {
      return sendRedirect(event, '/login?error=oauth-suspended')
    }

    // Update avatar if the user doesn't have one yet
    const updates: Record<string, unknown> = { lastSeenAt: new Date() }
    if (!existing.avatarUrl && info.avatarUrl) {
      updates.avatarUrl = info.avatarUrl
    }
    // A row nobody has verified is only a claim on the address, and the provider has just
    // proven who owns it. Two kinds reach here:
    // - An admin-created account (`!invited`) claimed via OAuth instead of the setup link.
    //   Left alone it stays badged "pending setup" forever, and `!invited` blocks reset.
    // - A self-registration. Its password is whoever registered first, which need not be
    //   the owner: kept, an attacker registers the address, the owner signs in here and
    //   uses the account, then clicks a "verify your email" mail the attacker re-sent, and
    //   the attacker's password works. register.post.ts closes the same chain for a second
    //   registration (tests/integration/auth/pre-hijack.test.ts).
    // Either way the claim is replaced: no password, verified, every outstanding link dead,
    // any sign-in the claimant held ended, and invitations claimed now the address is proven.
    const unclaimed = !existing.emailVerifiedAt
    if (unclaimed) {
      updates.passwordHash = '!oauth'
      updates.emailVerifiedAt = new Date()
      db.delete(schema.emailVerificationTokens)
        .where(eq(schema.emailVerificationTokens.userId, existing.id))
        .run()
    }
    db.update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, existing.id))
      .run()
    if (unclaimed) {
      endAllSessions(existing.id)
      claimProjectInvitations(email, existing.id)
    }

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
