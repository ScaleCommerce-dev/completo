import { eq, and, inArray, max } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card: existingCard } = await resolveCard(event)
  const body = await readBody<{
    title?: string
    description?: string
    assigneeId?: string | null
    priority?: 'low' | 'medium' | 'high' | 'urgent' | null
    statusId?: string
    dueDate?: string | null
    /** Makes the card a sub-issue of another card the caller can read; null makes it top-level. */
    parentId?: number | null
    /** A milestone of the card's project (of the target project when moving); null clears it. */
    milestoneId?: string | null
    /** Moves the card to another project the caller can read. */
    projectId?: string
    /** True takes the card out of every board, list and count; false brings it back. */
    archived?: boolean
  }>(event)

  // Moving to another project: the caller must read both, the status is mapped
  // by name (else the first of the same category, else the first), and what
  // belongs to the old project (milestone, tags, an assignee who is not a
  // member there) is dropped.
  const moveTo = body.projectId !== undefined && body.projectId !== existingCard.projectId ? body.projectId : null
  const visible = visibleProjectIds(user)
  if (moveTo !== null && (typeof moveTo !== 'string' || !visible.has(moveTo))) {
    throw createError({ statusCode: 400, message: 'Target project not found' })
  }
  const targetProjectId = moveTo ?? existingCard.projectId
  const moveUpdates: Record<string, unknown> = {}
  if (moveTo !== null) {
    if (body.statusId !== undefined) {
      throw createError({ statusCode: 400, message: 'Move the card first, then set a status of the new project' })
    }
    const from = db.select().from(schema.statuses).where(eq(schema.statuses.id, existingCard.statusId)).get()!
    const targetStatuses = db.select().from(schema.statuses).where(eq(schema.statuses.projectId, moveTo)).orderBy(schema.statuses.position).all()
    const mapped = targetStatuses.find(s => s.name === from.name) ?? targetStatuses.find(s => s.category === from.category) ?? targetStatuses[0]
    if (!mapped) throw createError({ statusCode: 400, message: 'Target project has no statuses' })
    moveUpdates.projectId = moveTo
    moveUpdates.statusId = mapped.id
    // Last in the target status, as a new card would be.
    const last = db.select({ p: max(schema.cards.position) }).from(schema.cards).where(eq(schema.cards.statusId, mapped.id)).get()
    moveUpdates.position = (last?.p ?? -1) + 1
    if (existingCard.milestoneId && body.milestoneId === undefined) moveUpdates.milestoneId = null
    const assignee = body.assigneeId !== undefined ? body.assigneeId : existingCard.assigneeId
    if (assignee) {
      const stays = db.select().from(schema.projectMembers)
        .where(and(eq(schema.projectMembers.projectId, moveTo), eq(schema.projectMembers.userId, assignee))).get()
      if (!stays) moveUpdates.assigneeId = null
    }
  }

  if (body.parentId !== undefined && body.parentId !== null) {
    requireVisibleCard(body.parentId, visible, 'Parent card')
    assertNoParentCycle(existingCard.id, Number(body.parentId))
  }

  if (body.milestoneId !== undefined && body.milestoneId !== null) {
    requireProjectMilestone(body.milestoneId, targetProjectId)
  }

  if (body.archived !== undefined && typeof body.archived !== 'boolean') {
    throw createError({ statusCode: 400, message: 'archived must be true or false' })
  }

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
  if (body.assigneeId !== undefined && body.assigneeId !== null && moveUpdates.assigneeId === undefined) {
    const isMember = db.select().from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, targetProjectId), eq(schema.projectMembers.userId, body.assigneeId)))
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
  if (body.parentId !== undefined) updates.parentId = body.parentId === null ? null : Number(body.parentId)
  if (body.milestoneId !== undefined) updates.milestoneId = body.milestoneId
  if (body.archived !== undefined) updates.archivedAt = body.archived ? (existingCard.archivedAt ?? new Date()) : null
  Object.assign(updates, moveUpdates)

  const changes = cardFieldChanges(existingCard, {
    ...body,
    statusId: updates.statusId as string | undefined,
    assigneeId: 'assigneeId' in updates ? updates.assigneeId as string | null : undefined,
    milestoneId: 'milestoneId' in updates ? updates.milestoneId as string | null : undefined,
    parentId: updates.parentId as number | null | undefined,
    dueDate: updates.dueDate as Date | null | undefined
  })
  // Tags belong to a project, so a moved card leaves the old project's behind.
  const leftTags = moveTo === null
    ? []
    : db.select({ id: schema.cardTags.id, tagId: schema.tags.id, name: schema.tags.name })
        .from(schema.cardTags)
        .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
        .where(and(eq(schema.cardTags.cardId, existingCard.id), eq(schema.tags.projectId, existingCard.projectId)))
        .all()
  db.transaction(() => {
    db.update(schema.cards).set(updates).where(eq(schema.cards.id, existingCard.id)).run()
    if (leftTags.length) {
      db.delete(schema.cardTags).where(inArray(schema.cardTags.id, leftTags.map(t => t.id))).run()
    }
    if (moveTo !== null) {
      // Attachment access is checked against the attachment's own projectId, so
      // the files go where the card went: the old project's members lose them.
      db.update(schema.attachments).set({ projectId: moveTo }).where(eq(schema.attachments.cardId, existingCard.id)).run()
      db.update(schema.notifications).set({ projectId: moveTo }).where(eq(schema.notifications.cardId, existingCard.id)).run()
    }
    recordCardEvents(user, [
      ...changes,
      ...leftTags.map(t => ({ cardId: existingCard.id, field: 'tag' as const, from: { id: t.tagId, value: t.name } }))
    ])
  })

  // Notifications: assignment change + mentions
  const needsAssignNotify = body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== existingCard.assigneeId
  const needsMentionNotify = body.description !== undefined && body.description
  if (needsAssignNotify || needsMentionNotify) {
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, targetProjectId)).get()
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

  // Open boards and lists drop a card that left their project or was archived.
  if (moveTo !== null) emitCardRemoved(existingCard.id, existingCard.projectId)
  if (card!.cards.archivedAt) emitCardRemoved(existingCard.id, targetProjectId)
  else emitCardChange(existingCard.id, targetProjectId)

  return {
    ...card!.cards,
    assignee: createUserRefs([card!.users]).ref(card!.users)
  }
})
