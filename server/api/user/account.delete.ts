import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { password } = await readBody<{ password: string }>(event)

  if (!password) {
    throw createError({ statusCode: 400, message: 'Password is required' })
  }

  if (user.isAdmin) {
    throw createError({ statusCode: 403, message: 'Admin accounts cannot be self-deleted' })
  }

  const userRecord = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()
  if (!userRecord) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const valid = await verifyPassword(userRecord.passwordHash, password)
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Password is incorrect' })
  }

  db.delete(schema.users).where(eq(schema.users.id, user.id)).run()
  await clearUserSession(event)

  return { ok: true }
})
