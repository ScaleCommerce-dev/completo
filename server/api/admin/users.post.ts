import { eq } from 'drizzle-orm'
import { adminUserCreateSchema } from '#shared/schemas/admin'

export default defineEventHandler(async (event) => {
  const { user: admin } = await requireAdmin(event)
  const { name, email: normalizedEmail } = await readBodyAs(event, adminUserCreateSchema)

  // Check duplicate email (generic error — don't leak existence)
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
