import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: admin } = await requireAdmin(event)
  const { name, email } = await readBody<{ name: string, email: string }>(event)

  if (!name || !email) {
    throw createError({ statusCode: 400, message: 'Name and email are required' })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw createError({ statusCode: 400, message: 'Invalid email format' })
  }

  // Check duplicate email (generic error — don't leak existence)
  const existing = db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).get()
  if (existing) {
    throw createError({ statusCode: 400, message: 'Unable to create account. Please try a different email.' })
  }

  // Create user with unusable password hash (no domain allowlist check — admin action)
  const userId = crypto.randomUUID()
  db.insert(schema.users).values({
    id: userId,
    email: email.toLowerCase(),
    name,
    passwordHash: '!invited'
  }).run()

  // Generate setup token (24h expiry) using emailVerificationTokens table
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
      await sendAccountSetupEmail(email, admin.name, setupUrl)
    } catch (err) {
      console.error('Failed to send account setup email:', (err as Error).message)
    }
  }

  setResponseStatus(event, 201)
  return { id: userId, email: email.toLowerCase(), name }
})
