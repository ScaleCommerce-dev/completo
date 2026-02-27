import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, list } = await resolveList(event, { columnAccess: false })
  const { statusId, title, description, priority, assigneeId, dueDate } = await readBody<{
    statusId: string
    title: string
    description?: string
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    assigneeId?: string
    dueDate?: string | null
  }>(event)

  if (!statusId || !title) {
    throw createError({ statusCode: 400, message: 'Status ID and title are required' })
  }

  // Validate statusId belongs to this project
  const status = db.select().from(schema.statuses)
    .where(and(eq(schema.statuses.id, statusId), eq(schema.statuses.projectId, list.projectId)))
    .get()
  if (!status) {
    throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
  }

  // Validate assigneeId belongs to this project
  if (assigneeId) {
    const isMember = db.select().from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, list.projectId), eq(schema.projectMembers.userId, assigneeId)))
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

    return db.insert(schema.cards).values({
      statusId,
      projectId: list.projectId,
      title,
      description: description || null,
      assigneeId: assigneeId || null,
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      position: maxPos + 1,
      createdById: user.id
    }).returning().get()
  })

  // Notifications: assignment + mentions on card creation
  const needsAssignNotify = assigneeId && assigneeId !== user.id
  const needsMentionNotify = description
  if (needsAssignNotify || needsMentionNotify) {
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, list.projectId)).get()
    if (project) {
      const ticketId = `${project.key || 'TK'}-${inserted.id}`
      if (needsAssignNotify) {
        createNotification({
          userId: assigneeId,
          type: 'card_assigned',
          title: 'Card assigned to you',
          message: `${user.name} assigned you to ${ticketId}: ${title}`,
          linkUrl: `/projects/${project.slug}/cards/${ticketId}`,
          projectId: project.id,
          cardId: inserted.id,
          actorId: user.id
        })
      }
      if (needsMentionNotify) {
        notifyMentionedUsers({
          description,
          projectId: project.id,
          cardId: inserted.id,
          actorId: user.id,
          actorName: user.name,
          cardTitle: title,
          projectSlug: project.slug,
          projectKey: project.key || 'TK'
        })
      }
    }
  }

  const card = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(eq(schema.cards.id, inserted.id))
    .get()

  setResponseStatus(event, 201)
  return {
    ...card!.cards,
    assignee: card!.users ? { id: card!.users.id, name: card!.users.name, avatarUrl: card!.users.avatarUrl } : null
  }
})
