import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { name, email, password, invitation } = await readBody<{ name: string, email: string, password: string, invitation?: string }>(event)

  if (!name || !email || !password) {
    throw createError({ statusCode: 400, message: 'Name, email, and password are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })
  }

  // Check if invitation token is valid — if so, skip domain allowlist + email verification
  let validInvitation = false
  if (invitation) {
    const invitationRow = db.select()
      .from(schema.projectInvitations)
      .where(eq(schema.projectInvitations.token, invitation))
      .get()

    if (invitationRow
      && invitationRow.expiresAt > new Date()
      && invitationRow.email.toLowerCase() === email.toLowerCase()) {
      validInvitation = true
    }
  }

  // Domain allowlist (only for self-registration, not invitations)
  if (!validInvitation) {
    const allowedDomains = getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
    if (allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1]?.toLowerCase()
      if (!emailDomain || !allowedDomains.includes(emailDomain)) {
        throw createError({ statusCode: 400, message: 'Registration is restricted to approved email domains' })
      }
    }
  }

  // Silent bail if email already taken — prevent enumeration
  const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get()
  if (existing) {
    return {
      message: 'Account created. Please check your email to verify your account.',
      requiresVerification: true
    }
  }

  const userId = crypto.randomUUID()
  db.insert(schema.users).values({
    id: userId,
    email,
    name,
    passwordHash: await hashPassword(password),
    emailVerifiedAt: validInvitation ? new Date() : null,
    lastSeenAt: new Date()
  }).run()

  // Claim any pending project invitations for this email
  claimProjectInvitations(email, userId)

  // Valid invitation: email ownership proven by the token — skip verification, auto-sign in
  if (validInvitation) {
    await setUserSession(event, {
      user: {
        id: userId,
        email,
        name,
        avatarUrl: null,
        colorMode: null,
        isAdmin: false
      }
    })

    return {
      message: 'Account created.',
      requiresVerification: false,
      user: { id: userId, email }
    }
  }

  // Normal registration: require email verification
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  db.insert(schema.emailVerificationTokens).values({
    userId,
    token,
    expiresAt
  }).run()

  if (isEmailEnabled()) {
    try {
      await sendVerificationEmail(email, token)
    } catch (err) {
      console.error('Failed to send verification email:', (err as Error).message)
    }
  }

  return {
    message: 'Account created. Please check your email to verify your account.',
    requiresVerification: true,
    user: { id: userId, email }
  }
})
