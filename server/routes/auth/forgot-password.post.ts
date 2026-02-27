import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email } = await readBody<{ email: string }>(event)

  if (!email) {
    throw createError({ statusCode: 400, message: 'Email is required' })
  }

  // Always return the same message (anti-enumeration)
  const successMessage = 'If an account with that email exists, a password reset link has been sent.'

  const user = db.select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase().trim()))
    .get()

  // Silent bail: no user, suspended, invited, or unverified
  if (!user || user.suspendedAt || user.passwordHash === '!invited' || !user.emailVerifiedAt) {
    return { message: successMessage }
  }

  // Delete old tokens for this user (clean slate)
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, user.id))
    .run()

  // Create new token with 1-hour expiry
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  db.insert(schema.emailVerificationTokens).values({
    userId: user.id,
    token,
    expiresAt
  }).run()

  if (isEmailEnabled()) {
    try {
      await sendPasswordResetEmail(user.email, token)
    } catch (err) {
      console.error('Failed to send password reset email:', (err as Error).message)
    }
  }

  return { message: successMessage }
})
