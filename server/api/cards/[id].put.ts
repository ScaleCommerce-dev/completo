import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card: existingCard } = await resolveCard(event)
  const body = await readBody<{
    title?: string
    description?: string
    assigneeId?: string | null
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    statusId?: string
    dueDate?: string | null
  }>(event)

  // Validate statusId belongs to the card's project
  if (body.statusId !== undefined) {
    const status = db.select().from(schema.statuses)
      .where(and(eq(schema.statuses.id, body.statusId), eq(schema.statuses.projectId, existingCard.projectId)))
      .get()
    if (!status) {
      throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
    }
  }

  // Validate assigneeId belongs to this project
  if (body.assigneeId !== undefined && body.assigneeId !== null) {
    const isMember = db.select().from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, existingCard.projectId), eq(schema.projectMembers.userId, body.assigneeId)))
      .get()
    if (!isMember) {
      throw createError({ statusCode: 400, message: 'Assignee is not a project member' })
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.statusId !== undefined) updates.statusId = body.statusId
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null

  db.update(schema.cards).set(updates).where(eq(schema.cards.id, existingCard.id)).run()

  // Notifications: assignment change + mentions
  const needsAssignNotify = body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== existingCard.assigneeId
  const needsMentionNotify = body.description !== undefined && body.description
  if (needsAssignNotify || needsMentionNotify) {
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, existingCard.projectId)).get()
    if (project) {
      const ticketId = `${project.key || 'TK'}-${existingCard.id}`
      if (needsAssignNotify) {
        createNotification({
          userId: body.assigneeId!,
          type: 'card_assigned',
          title: 'Card assigned to you',
          message: `${user.name} assigned you to ${ticketId}: ${body.title || existingCard.title}`,
          linkUrl: `/projects/${project.slug}/cards/${ticketId}`,
          projectId: project.id,
          cardId: existingCard.id,
          actorId: user.id
        })
      }
      if (needsMentionNotify) {
        notifyMentionedUsers({
          description: body.description!,
          oldDescription: existingCard.description,
          projectId: project.id,
          cardId: existingCard.id,
          actorId: user.id,
          actorName: user.name,
          cardTitle: body.title || existingCard.title,
          projectSlug: project.slug,
          projectKey: project.key || 'TK'
        })
      }
    }
  }

  const card = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(eq(schema.cards.id, existingCard.id))
    .get()

  return {
    ...card!.cards,
    assignee: card!.users ? { id: card!.users.id, name: card!.users.name, avatarUrl: card!.users.avatarUrl } : null
  }
})
