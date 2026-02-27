import { eq, isNotNull, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)

  db.delete(schema.notifications)
    .where(and(
      eq(schema.notifications.userId, user.id),
      isNotNull(schema.notifications.readAt)
    ))
    .run()

  return { ok: true }
})
