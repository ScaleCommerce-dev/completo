import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)

  const rows = db.select({
    id: schema.notifications.id,
    type: schema.notifications.type,
    title: schema.notifications.title,
    message: schema.notifications.message,
    linkUrl: schema.notifications.linkUrl,
    projectId: schema.notifications.projectId,
    cardId: schema.notifications.cardId,
    readAt: schema.notifications.readAt,
    createdAt: schema.notifications.createdAt,
    actorName: schema.users.name,
    actorAvatarUrl: schema.users.avatarUrl
  })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .all()

  return rows
})
