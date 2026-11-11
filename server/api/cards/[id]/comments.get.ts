import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)

  // Fetching the comment list is the "I have seen this card's discussion" signal
  // that clears its unread dot. Stamped before returning so a follow-up board
  // fetch already reflects it.
  //
  // `?markRead=false` reads without that signal. `completo get` fetches the
  // comments as context for whoever runs it, usually an agent on a person's
  // token; stamping there would clear that person's dots on cards they never
  // opened.
  if (getQuery(event).markRead !== 'false') {
    markCardRead(user.id, card.id)
  }

  const rows = db.select({
    id: schema.comments.id,
    cardId: schema.comments.cardId,
    body: schema.comments.body,
    createdAt: schema.comments.createdAt,
    updatedAt: schema.comments.updatedAt,
    authorId: schema.comments.authorId,
    // Deliberately no email — user-facing lookups expose names only.
    authorName: schema.users.name,
    authorAvatarUrl: schema.users.avatarUrl,
    authorKind: schema.users.kind,
    authorColor: schema.users.color,
    authorManagedById: schema.users.managedById
  })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
    .where(eq(schema.comments.cardId, card.id))
    .orderBy(asc(schema.comments.createdAt))
    .all()

  return withAuthorRefs(rows)
})
