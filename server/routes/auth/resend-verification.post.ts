import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email } = await readBody<{ email?: string }>(event)
  // Read expired token from httpOnly cookie (set by verify-email redirect)
  const token = getCookie(event, 'expired-verification-token')

  if (!email && !token) {
    throw createError({ statusCode: 400, message: 'Email is required' })
  }

  // Always return same message to prevent email enumeration
  const successMessage = 'If the account exists and is not yet verified, a new verification email has been sent.'

  let user

  if (token) {
    // Look up user via expired verification token
    const tokenRow = db.select()
      .from(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.token, token))
      .get()

    if (!tokenRow) {
      return { message: successMessage }
    }

    user = db.select()
      .from(schema.users)
      .where(eq(schema.users.id, tokenRow.userId))
      .get()
  } else {
    user = db.select()
      .from(schema.users)
      .where(eq(schema.users.email, email!))
      .get()
  }

  // Clear the cookie regardless of outcome
  if (token) {
    deleteCookie(event, 'expired-verification-token')
  }

  if (!user || user.emailVerifiedAt) {
    return { message: successMessage }
  }

  // Delete old tokens for this user
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, user.id))
    .run()

  // Generate new token (24h expiry)
  const newToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  db.insert(schema.emailVerificationTokens).values({
    userId: user.id,
    token: newToken,
    expiresAt
  }).run()

  if (isEmailEnabled()) {
    try {
      await sendVerificationEmail(user.email, newToken)
    } catch (err) {
      console.error('Failed to send verification email:', (err as Error).message)
    }
  }

  return { message: successMessage }
})
