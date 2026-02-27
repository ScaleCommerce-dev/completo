import { eq, isNull, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)

  db.update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(schema.notifications.userId, user.id),
      isNull(schema.notifications.readAt)
    ))
    .run()

  return { ok: true }
})
