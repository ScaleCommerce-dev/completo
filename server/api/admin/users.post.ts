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
  const normalizedEmail = email.trim().toLowerCase()
  const existing = db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).get()
  if (existing) {
    throw createError({ statusCode: 400, message: 'Unable to create account. Please try a different email.' })
  }

  // Create user with unusable password hash (no domain allowlist check — admin action)
  const userId = crypto.randomUUID()
  db.insert(schema.users).values({
    id: userId,
    email: normalizedEmail,
    name,
    passwordHash: '!invited'
  }).run()

  await sendAccountSetupLink({ id: userId, email: normalizedEmail }, admin.name)

  setResponseStatus(event, 201)
  return { id: userId, email: normalizedEmail, name }
})
