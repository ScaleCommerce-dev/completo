import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)

  // Fetching the comment list is the "I have seen this card's discussion" signal
  // that clears its unread dot. Stamped before returning so a follow-up board
  // fetch already reflects it.
  markCardRead(user.id, card.id)

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
