import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, comment, card, project } = await resolveComment(event)

  const body = await readBody<{ body?: string }>(event)
  const text = body?.body?.trim()
  if (!text) {
    throw createError({ statusCode: 400, message: 'Comment body is required' })
  }

  const updated = db.update(schema.comments)
    .set({ body: text, updatedAt: new Date() })
    .where(eq(schema.comments.id, comment.id))
    .returning()
    .get()

  if (project) {
    // Only newly added mentions are notified; editing never re-notifies everyone.
    notifyCommentActivity({
      body: text,
      oldBody: comment.body,
      projectId: card.projectId,
      cardId: card.id,
      cardTitle: card.title,
      assigneeId: card.assigneeId,
      actorId: user.id,
      actorName: user.name,
      projectSlug: project.slug,
      projectKey: project.key || 'TK',
      isNew: false
    })
  }

  return {
    ...updated,
    authorName: user.name,
    authorAvatarUrl: user.avatarUrl
  }
})
