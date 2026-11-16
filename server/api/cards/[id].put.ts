import { eq, and } from 'drizzle-orm'
import { cardUpdateSchema } from '#shared/schemas/card'

export default defineEventHandler(async (event) => {
  const { user, card: existingCard } = await resolveCard(event)
  const body = await readBodyAs(event, cardUpdateSchema)

  // Validate statusId belongs to the card's project
  if (body.statusId !== undefined) {
    const status = db.select().from(schema.statuses)
      .where(and(eq(schema.statuses.id, body.statusId), eq(schema.statuses.projectId, existingCard.projectId)))
      .get()
    if (!status) {
      throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
    }
    assertCanEnterStatus(existingCard, body.statusId)
  }

  // Validate the parent: same project, one level (`server/utils/subtasks.ts`)
  const parentId = body.parentId === undefined
    ? undefined
    : body.parentId === null ? null : requireParent({ projectId: existingCard.projectId, parentId: body.parentId, cardId: existingCard.id }).id

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
  if (parentId !== undefined) updates.parentId = parentId

  const changes = [
    ...cardFieldChanges(existingCard, { ...body, dueDate: updates.dueDate as Date | null | undefined }),
    ...(parentId !== undefined ? parentChanges(existingCard.id, existingCard.parentId, parentId) : [])
  ]
  db.transaction(() => {
    db.update(schema.cards).set(updates).where(eq(schema.cards.id, existingCard.id)).run()
    recordCardEvents(user, changes)
  })

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
      const mentioned = needsMentionNotify
        ? notifyMentionedUsers({
            text: body.description!,
            oldText: existingCard.description,
            projectId: project.id,
            cardId: existingCard.id,
            actorId: user.id,
            actorName: user.name,
            cardTitle: body.title || existingCard.title,
            projectSlug: project.slug,
            projectKey: project.key || 'TK'
          })
        : new Set<string>()

      sendCardActivityEmails({
        actorId: user.id,
        actorName: user.name,
        project,
        cardId: existingCard.id,
        cardTitle: body.title || existingCard.title,
        assignedUserId: needsAssignNotify ? body.assigneeId : null,
        mentionedUserIds: mentioned,
        mentionText: body.description,
        mentionSource: 'description'
      })
    }
  }

  const card = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(eq(schema.cards.id, existingCard.id))
    .get()

  emitCardChange(existingCard.id, existingCard.projectId)
  // A parent shows its sub-tasks' progress, and a sub-task shows its parent's
  // title: whichever of those this write changed is pushed as well.
  const parents = new Set<number>()
  if (existingCard.parentId && (body.statusId !== undefined || parentId !== undefined)) parents.add(existingCard.parentId)
  if (parentId) parents.add(parentId)
  for (const id of parents) emitCardChange(id, existingCard.projectId)
  if (body.title !== undefined && body.title !== existingCard.title) {
    for (const child of subtasksOf(existingCard.id)) emitCardChange(child.id, existingCard.projectId)
  }

  return {
    ...card!.cards,
    assignee: createUserRefs([card!.users]).ref(card!.users),
    // What a view paints from the parent link, so changing it repaints the card
    // without waiting for the live event (which the writer's own view ignores).
    parent: card!.cards.parentId ? parentRefs([card!.cards.parentId]).get(card!.cards.parentId) ?? null : null,
    subtasks: subtaskProgress([existingCard.id]).get(existingCard.id) ?? null
  }
})
