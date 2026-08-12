import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)

  return db.select({
    id: schema.comments.id,
    cardId: schema.comments.cardId,
    body: schema.comments.body,
    createdAt: schema.comments.createdAt,
    updatedAt: schema.comments.updatedAt,
    authorId: schema.comments.authorId,
    // Deliberately no email — user-facing lookups expose names only.
    authorName: schema.users.name,
    authorAvatarUrl: schema.users.avatarUrl
  })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
    .where(eq(schema.comments.cardId, card.id))
    .orderBy(asc(schema.comments.createdAt))
    .all()
})
