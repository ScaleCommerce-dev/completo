import { eq, or, and, inArray, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')
  const { projectSlug } = getQuery(event) as { projectSlug?: string }

  // Try to find by ID first, then by slug (scoped to project if projectSlug provided)
  let board
  if (projectSlug) {
    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.slug, projectSlug))
      .get()
    if (project) {
      board = db.select().from(schema.boards)
        .where(and(
          or(eq(schema.boards.id, id!), eq(schema.boards.slug, id!)),
          eq(schema.boards.projectId, project.id)
        ))
        .get()
    }
  }
  if (!board) {
    board = db.select().from(schema.boards)
      .where(or(eq(schema.boards.id, id!), eq(schema.boards.slug, id!)))
      .get()
  }
  if (!board) {
    throw createError({ statusCode: 404, message: 'Board not found' })
  }

  let membership
  try {
    membership = requireProjectMember(board.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Board not found' })
  }

  // Fetch board creator info
  const createdBy = board.createdById
    ? db.select({ id: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
      .from(schema.users)
      .where(eq(schema.users.id, board.createdById))
      .get() || null
    : null

  // Fetch columns via board_columns join, sorted by board_columns.position
  const bcRows = db.select()
    .from(schema.boardColumns)
    .innerJoin(schema.statuses, eq(schema.boardColumns.statusId, schema.statuses.id))
    .where(eq(schema.boardColumns.boardId, board.id))
    .all()
    .sort((a, b) => a.board_columns.position - b.board_columns.position)

  const boardColumns = bcRows.map(row => ({
    ...row.statuses,
    position: row.board_columns.position
  }))

  const statusIds = boardColumns.map(c => c.id)

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, board.projectId))
    .get()

  // Fetch cards where statusId is in the board's column set
  const allBoardCards = statusIds.length
    ? db.select().from(schema.cards)
      .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
      .where(inArray(schema.cards.statusId, statusIds))
      .all()
      .map(row => ({
        ...row.cards,
        assignee: row.users ? { id: row.users.id, name: row.users.name, avatarUrl: row.users.avatarUrl } : null
      }))
    : []

  // Filter out done cards past retention window
  let boardCards = allBoardCards
  if (project?.doneStatusId && project.doneRetentionDays != null) {
    const cutoff = Date.now() - project.doneRetentionDays * 86400000
    boardCards = allBoardCards.filter(card => {
      if (card.statusId !== project.doneStatusId) return true
      return card.updatedAt.getTime() >= cutoff
    })
  }

  // Fetch tags for all board cards in one bulk query (no N+1)
  const cardIds = boardCards.map(c => c.id)
  const allCardTags = cardIds.length
    ? db.select().from(schema.cardTags)
      .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
      .where(inArray(schema.cardTags.cardId, cardIds))
      .all()
    : []

  const tagsByCard = new Map<number, Array<{ id: string, name: string, color: string }>>()
  for (const row of allCardTags) {
    const cardId = row.card_tags.cardId
    if (!tagsByCard.has(cardId)) tagsByCard.set(cardId, [])
    tagsByCard.get(cardId)!.push({
      id: row.tags.id,
      name: row.tags.name,
      color: row.tags.color
    })
  }

  // Bulk-fetch attachment counts
  const attachmentCounts = cardIds.length
    ? db.select({
      cardId: schema.attachments.cardId,
      count: sql<number>`count(*)`
    })
      .from(schema.attachments)
      .where(inArray(schema.attachments.cardId, cardIds))
      .groupBy(schema.attachments.cardId)
      .all()
    : []
  const attachCountByCard = new Map(attachmentCounts.map(r => [r.cardId, r.count]))

  const cardsWithTags = boardCards.map(card => ({
    ...card,
    tags: tagsByCard.get(card.id) || [],
    attachmentCount: attachCountByCard.get(card.id) || 0
  }))

  // Fetch project-level tags for the picker
  const projectTags = db.select().from(schema.tags)
    .where(eq(schema.tags.projectId, board.projectId))
    .all()

  const members = db.select({
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(eq(schema.projectMembers.projectId, board.projectId))
    .all()

  // Find project statuses not linked to this board
  const allProjectColumns = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, board.projectId))
    .all()

  const linkedStatusIds = new Set(statusIds)
  const availableColumns = allProjectColumns.filter(c => !linkedStatusIds.has(c.id))

  return {
    ...board,
    tagFilters: board.tagFilters ? JSON.parse(board.tagFilters) : [],
    createdBy,
    role: membership.role,
    project: project ? { id: project.id, name: project.name, slug: project.slug, key: project.key, doneStatusId: project.doneStatusId, doneRetentionDays: project.doneRetentionDays } : null,
    columns: boardColumns,
    cards: cardsWithTags,
    members,
    tags: projectTags,
    availableColumns
  }
})
