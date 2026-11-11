import { eq, and } from 'drizzle-orm'

interface CreateCardParams {
  projectId: string
  userId: string
  userName: string
  body: {
    statusId: string
    title: string
    description?: string
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    assigneeId?: string
    dueDate?: string | null
  }
  /**
   * Tags to attach in the same transaction as the card, already validated as this
   * project's by the caller. Outside `body` on purpose: `POST /projects/:id/cards`
   * passes its request body straight through, and its clients set tags with
   * `PUT /cards/:id/tags` afterwards — this is for callers that must not leave a
   * card behind without the tags that decide which boards show it.
   */
  tags?: Array<{ id: string, name: string }>
}

export function createCard({ projectId, userId, userName, body, tags = [] }: CreateCardParams) {
  const { statusId, title, description, priority, assigneeId, dueDate } = body

  if (!statusId || !title) {
    throw createError({ statusCode: 400, message: 'Status ID and title are required' })
  }

  // Validate statusId belongs to this project
  const status = db.select().from(schema.statuses)
    .where(and(eq(schema.statuses.id, statusId), eq(schema.statuses.projectId, projectId)))
    .get()
  if (!status) {
    throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
  }

  // Validate assigneeId belongs to this project
  if (assigneeId) {
    const isMember = db.select().from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, assigneeId)))
      .get()
    if (!isMember) {
      throw createError({ statusCode: 400, message: 'Assignee is not a project member' })
    }
  }

  const inserted = db.transaction(() => {
    const maxPos = db.select({ pos: schema.cards.position }).from(schema.cards)
      .where(eq(schema.cards.statusId, statusId))
      .all()
      .reduce((max, r) => Math.max(max, r.pos), -1)

    const row = db.insert(schema.cards).values({
      statusId,
      projectId,
      title,
      description: description || null,
      assigneeId: assigneeId || null,
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      position: maxPos + 1,
      createdById: userId
    }).returning().get()

    for (const tag of tags) {
      db.insert(schema.cardTags).values({ id: crypto.randomUUID(), cardId: row.id, tagId: tag.id }).run()
    }
    // Same events `PUT /cards/:id/tags` writes when a hand-made card is tagged.
    recordCardEvents({ id: userId, name: userName }, tags.map(tag => ({
      cardId: row.id,
      field: 'tag' as const,
      to: { id: tag.id, value: tag.name }
    })))

    return row
  })

  // Notifications: assignment + mentions on card creation
  const needsAssignNotify = assigneeId && assigneeId !== userId
  const needsMentionNotify = description
  if (needsAssignNotify || needsMentionNotify) {
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
    if (project) {
      const ticketId = `${project.key || 'TK'}-${inserted.id}`
      if (needsAssignNotify) {
        createNotification({
          userId: assigneeId,
          type: 'card_assigned',
          title: 'Card assigned to you',
          message: `${userName} assigned you to ${ticketId}: ${title}`,
          linkUrl: `/projects/${project.slug}/cards/${ticketId}`,
          projectId: project.id,
          cardId: inserted.id,
          actorId: userId
        })
      }
      const mentioned = needsMentionNotify
        ? notifyMentionedUsers({
            text: description,
            projectId: project.id,
            cardId: inserted.id,
            actorId: userId,
            actorName: userName,
            cardTitle: title,
            projectSlug: project.slug,
            projectKey: project.key || 'TK'
          })
        : new Set<string>()

      sendCardActivityEmails({
        actorId: userId,
        actorName: userName,
        project,
        cardId: inserted.id,
        cardTitle: title,
        assignedUserId: needsAssignNotify ? assigneeId : null,
        mentionedUserIds: mentioned,
        mentionText: description,
        mentionSource: 'description'
      })
    }
  }

  const card = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(eq(schema.cards.id, inserted.id))
    .get()

  // Live-update every open board/list of this project. The single choke point:
  // both card-create endpoints go through here, so neither has to remember to.
  emitCardChange(inserted.id, projectId)

  return {
    ...card!.cards,
    assignee: createUserRefs([card!.users]).ref(card!.users)
  }
}
