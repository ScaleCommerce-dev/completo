import { eq, and, gt } from 'drizzle-orm'
import type { EventHandler, H3Event } from 'h3'

interface OAuthUserInfo {
  email: string
  name: string
  avatarUrl: string | null
  provider: string
}

/** Where the sign-in started, kept across the provider round trip. */
const RETURN_COOKIE = 'completo_oauth_return'

/**
 * Wrap a provider route so a `?redirect=` on the first request (the one that
 * leaves for the provider) survives until the callback: the provider sends the
 * browser back without it. Checked by `safeReturnPath` on the way in and again on
 * the way out, so the cookie can only ever hold a path on this site.
 */
export function withReturnPath(handler: EventHandler): EventHandler {
  return defineEventHandler((event) => {
    const query = getQuery(event)
    if (!query.code && typeof query.redirect === 'string') {
      const target = safeReturnPath(query.redirect, '')
      if (target) setCookie(event, RETURN_COOKIE, target, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 })
    }
    return handler(event)
  })
}

function takeReturnPath(event: H3Event): string {
  const target = getCookie(event, RETURN_COOKIE)
  if (target) deleteCookie(event, RETURN_COOKIE, { path: '/' })
  return safeReturnPath(target)
}

/** Whether an unexpired project invitation names this address. */
function hasPendingInvitation(email: string): boolean {
  return !!db.select({ id: schema.projectInvitations.id })
    .from(schema.projectInvitations)
    .where(and(eq(schema.projectInvitations.email, email), gt(schema.projectInvitations.expiresAt, new Date())))
    .get()
}

/**
 * Shared handler for all OAuth providers.
 * Finds or creates a user by email, sets the session, and redirects to where the
 * sign-in started (`withReturnPath`), else /projects.
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

    return sendRedirect(event, takeReturnPath(event))
  }

  // New user — check domain allowlist. It restricts self-registration only: an
  // invited address is let in, as the invitation link on /register lets it in.
  // The provider has verified the address, so holding the invitation's address is
  // the same proof the emailed link gives.
  const allowedDomains = getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
  if (allowedDomains.length > 0 && !hasPendingInvitation(email)) {
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

  return sendRedirect(event, takeReturnPath(event))
}
