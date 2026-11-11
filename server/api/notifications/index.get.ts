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
    actorAvatarUrl: schema.users.avatarUrl,
    actorId: schema.users.id,
    actorKind: schema.users.kind,
    actorColor: schema.users.color,
    actorManagedById: schema.users.managedById
  })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .all()

  // Whether the actor is an agent, and whose, so the avatar can show it.
  const actors = rows.map(r => r.actorId
    ? { id: r.actorId, name: r.actorName!, avatarUrl: r.actorAvatarUrl, kind: r.actorKind!, color: r.actorColor, managedById: r.actorManagedById }
    : null)
  const { ref } = createUserRefs(actors)
  return rows.map(({ actorManagedById: _managedById, ...row }, i) => ({
    ...row,
    actorManagedBy: ref(actors[i])?.managedBy ?? null
  }))
})
