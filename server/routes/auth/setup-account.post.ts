import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { token, password, name } = await readBody<{ token: string, password: string, name?: string }>(event)

  if (!token || !password) {
    throw createError({ statusCode: 400, message: 'Token and password are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })
  }

  // Validate token and look up user
  const { user } = lookupVerificationToken(token, 'setup link')
  ensureNotSuspended(user)

  // Require name if the user doesn't have one yet
  const finalName = (name && name.trim()) ? name.trim() : user.name
  if (!finalName || !finalName.trim()) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }

  // Set password, verify email, and update name
  const updateFields: Record<string, unknown> = {
    passwordHash: await hashPassword(password),
    emailVerifiedAt: new Date(),
    lastSeenAt: new Date(),
    name: finalName
  }
  db.update(schema.users)
    .set(updateFields)
    .where(eq(schema.users.id, user.id))
    .run()

  // Delete all verification tokens for this user
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, user.id))
    .run()

  // Claim any pending project invitations
  claimProjectInvitations(user.email, user.id)

  // Auto-sign in
  await setAuthSession(event, user, { name: finalName })

  return { ok: true }
})
