import { eq, isNull, count, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)

  const result = db.select({ count: count() })
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.userId, user.id),
      isNull(schema.notifications.readAt)
    ))
    .get()

  return { count: result?.count ?? 0 }
})
