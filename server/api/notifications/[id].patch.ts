import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!

  const notification = db.select()
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.id, id),
      eq(schema.notifications.userId, user.id)
    ))
    .get()

  if (!notification) {
    throw createError({ statusCode: 404, message: 'Notification not found' })
  }

  db.update(schema.notifications)
    .set({ readAt: new Date() })
    .where(eq(schema.notifications.id, id))
    .run()

  return { ok: true }
})
