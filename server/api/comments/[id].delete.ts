import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // Project owners and instance admins may remove another member's comment;
  // editing stays author-only. CF-401 will record the moderated case.
  const { comment, card } = await resolveComment(event, { auth: 'authorOrOwner' })

  db.delete(schema.comments).where(eq(schema.comments.id, comment.id)).run()

  emitCardChange(comment.cardId, card.projectId)

  return { ok: true }
})
