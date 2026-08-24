import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)

  const body = await readBody<{ body?: string }>(event)
  const text = body?.body?.trim()
  if (!text) {
    throw createError({ statusCode: 400, message: 'Comment body is required' })
  }

  const comment = db.insert(schema.comments).values({
    cardId: card.id,
    authorId: user.id,
    body: text
  }).returning().get()

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, card.projectId))
    .get()

  if (project) {
    notifyCommentActivity({
      body: text,
      projectId: card.projectId,
      cardId: card.id,
      cardTitle: card.title,
      assigneeId: card.assigneeId,
      actorId: user.id,
      actorName: user.name,
      projectSlug: project.slug,
      projectKey: project.key || 'TK',
      isNew: true
    })
  }

  // commentCount is a card face badge, so a new comment is a view change; the
  // activity event additionally raises the unread dot for everyone but the author.
  emitCardChange(card.id, card.projectId)
  emitCardActivity(card.id, card.projectId, user.id)

  setResponseStatus(event, 201)
  return {
    ...comment,
    authorName: user.name,
    authorAvatarUrl: user.avatarUrl
  }
})
