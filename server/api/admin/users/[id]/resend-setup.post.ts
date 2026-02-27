import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: admin } = await requireAdmin(event)
  const userId = getRouterParam(event, 'id')!

  const targetUser = db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get()

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  if (targetUser.passwordHash !== '!invited' || targetUser.emailVerifiedAt !== null) {
    throw createError({ statusCode: 400, message: 'User has already completed setup' })
  }

  // Delete old verification tokens for this user
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, userId))
    .run()

  // Create new 24h token
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  db.insert(schema.emailVerificationTokens).values({
    userId,
    token,
    expiresAt
  }).run()

  // Send setup email
  if (isEmailEnabled()) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000'
    const setupUrl = `${baseUrl}/auth/setup-account?token=${token}`
    try {
      await sendAccountSetupEmail(targetUser.email, admin.name, setupUrl)
    } catch (err) {
      console.error('Failed to send account setup email:', (err as Error).message)
    }
  }

  return { ok: true }
})
