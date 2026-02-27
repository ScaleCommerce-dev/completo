import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { token, password } = await readBody<{ token: string, password: string }>(event)

  if (!token || !password) {
    throw createError({ statusCode: 400, message: 'Token and password are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })
  }

  // Validate token and look up user
  const { user } = lookupVerificationToken(token, 'reset link')
  ensureNotSuspended(user)

  if (user.passwordHash === '!invited') {
    throw createError({ statusCode: 400, message: 'Invalid or expired reset link' })
  }

  // Update password
  db.update(schema.users)
    .set({
      passwordHash: await hashPassword(password),
      lastSeenAt: new Date()
    })
    .where(eq(schema.users.id, user.id))
    .run()

  // Delete all verification tokens for this user
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, user.id))
    .run()

  // Auto-sign in
  await setAuthSession(event, user)

  return { ok: true }
})
