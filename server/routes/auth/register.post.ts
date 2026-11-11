import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { name, email, password, invitation } = await readBody<{ name: string, email: string, password: string, invitation?: string }>(event)

  if (!name || !email || !password) {
    throw createError({ statusCode: 400, message: 'Name, email, and password are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })
  }

  // Normalise before anything compares or stores it. `users.email` is UNIQUE but has no
  // COLLATE NOCASE, so an un-normalised address here created a second row for someone who
  // already existed — and since login is normalised too, they could then only sign in with
  // the exact capitalisation they happened to type.
  const normalizedEmail = email.trim().toLowerCase()

  // Check if invitation token is valid — if so, skip domain allowlist + email verification
  let validInvitation = false
  if (invitation) {
    const invitationRow = db.select()
      .from(schema.projectInvitations)
      .where(eq(schema.projectInvitations.token, invitation))
      .get()

    if (invitationRow
      && invitationRow.expiresAt > new Date()
      && invitationRow.email.toLowerCase() === normalizedEmail) {
      validInvitation = true
    }
  }

  // Domain allowlist (only for self-registration, not invitations)
  if (!validInvitation) {
    const allowedDomains = getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
    if (allowedDomains.length > 0) {
      const emailDomain = normalizedEmail.split('@')[1]
      if (!emailDomain || !allowedDomains.includes(emailDomain)) {
        throw createError({ statusCode: 400, message: DOMAIN_RESTRICTED_MESSAGE })
      }
    }
  }

  // Silent bail if email already taken — prevent enumeration
  const existing = db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).get()

  // A self-registration nobody has verified yet is not an account, only a claim on an
  // address. It used to keep the first caller's password and answer everyone after
  // with "check your email" — so an attacker could register a colleague's address
  // first, wait for the colleague to click the genuine verification mail, and then
  // sign in with their own password. Whoever registers now replaces that claim, and
  // the earlier link dies with it.
  const unclaimed = existing
    && existing.kind === 'human'
    && !existing.emailVerifiedAt
    && !isPendingSetup(existing)
    && !existing.suspendedAt

  if (existing && !unclaimed) {
    // One exception to "do nothing": an admin-created account that was never claimed. That
    // person has no password (`!invited` is unhashable) and no way in, so silently doing
    // nothing stranded them — they waited for an email that was never sent. Re-send their
    // setup link instead. The response below is identical either way, so this still reveals
    // nothing about whether the address exists.
    if (existing.kind !== 'agent' && isPendingSetup(existing) && !existing.suspendedAt) {
      await sendAccountSetupLink(existing, 'An administrator')
    }

    return {
      message: 'Account created. Please check your email to verify your account.',
      requiresVerification: true
    }
  }

  const passwordHash = await hashPassword(password)
  const emailVerifiedAt = validInvitation ? new Date() : null
  let userId: string
  if (unclaimed) {
    userId = existing.id
    db.update(schema.users)
      .set({ name, passwordHash, emailVerifiedAt, lastSeenAt: new Date() })
      .where(eq(schema.users.id, userId))
      .run()
    db.delete(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.userId, userId))
      .run()
  } else {
    userId = crypto.randomUUID()
    db.insert(schema.users).values({
      id: userId,
      email: normalizedEmail,
      name,
      passwordHash,
      emailVerifiedAt,
      lastSeenAt: new Date()
    }).run()
  }

  // Invitations become memberships only once the address is proven: here when the
  // invitation token proved it, otherwise in verify-email. Claiming them on an
  // unverified row handed the memberships to whoever registered first.
  if (validInvitation) claimProjectInvitations(normalizedEmail, userId)

  // Valid invitation: email ownership proven by the token — skip verification, auto-sign in
  if (validInvitation) {
    await setUserSession(event, {
      user: {
        id: userId,
        email: normalizedEmail,
        name,
        avatarUrl: null,
        colorMode: null,
        isAdmin: false
      }
    })

    return {
      message: 'Account created.',
      requiresVerification: false,
      user: { id: userId, email: normalizedEmail }
    }
  }

  // Normal registration: require email verification
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  db.insert(schema.emailVerificationTokens).values({
    userId,
    token,
    purpose: 'verify',
    expiresAt
  }).run()

  if (isEmailEnabled()) {
    try {
      await sendVerificationEmail(normalizedEmail, token)
    } catch (err) {
      console.error('Failed to send verification email:', (err as Error).message)
    }
  }

  return {
    message: 'Account created. Please check your email to verify your account.',
    requiresVerification: true,
    user: { id: userId, email: normalizedEmail }
  }
})
