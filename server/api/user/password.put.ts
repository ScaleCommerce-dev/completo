import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { currentPassword, newPassword } = await readBody<{ currentPassword: string, newPassword: string }>(event)

  if (!currentPassword || !newPassword) {
    throw createError({ statusCode: 400, message: 'Current password and new password are required' })
  }

  if (newPassword.length < 8) {
    throw createError({ statusCode: 400, message: 'New password must be at least 8 characters' })
  }

  const userRecord = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()
  if (!userRecord) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const valid = await verifyPassword(userRecord.passwordHash, currentPassword)
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Current password is incorrect' })
  }

  const newHash = await hashPassword(newPassword)
  db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, user.id)).run()

  return { ok: true }
})
