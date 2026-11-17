import { and, eq, inArray, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project, membership } = await resolveProject(event)

  const projectBoards = db.select().from(schema.boards)
    .where(eq(schema.boards.projectId, project.id))
    .all()

  // Batch-fetch boardColumns and cards for stats (no N+1)
  const boardIds = projectBoards.map(b => b.id)
  const allBoardColumns = boardIds.length
    ? db.select().from(schema.boardColumns).where(inArray(schema.boardColumns.boardId, boardIds)).all()
    : []
  // Every number below derives from a card's status and priority, so the cards are
  // counted in groups of those two rather than loaded: this used to select every
  // column of every card, descriptions included. A few rows per status come back.
  const cardGroups = db.select({
    statusId: schema.cards.statusId,
    priority: schema.cards.priority,
    count: sql<number>`count(*)`,
    // Seconds (drizzle `mode: 'timestamp'`).
    lastUpdated: sql<number>`max(${schema.cards.updatedAt})`
  })
    .from(schema.cards)
    .where(eq(schema.cards.projectId, project.id))
    .groupBy(schema.cards.statusId, schema.cards.priority)
    .all()

  // Build status→board mapping
  const statusToBoardIds = new Map<string, Set<string>>()
  for (const bc of allBoardColumns) {
    if (!statusToBoardIds.has(bc.statusId)) statusToBoardIds.set(bc.statusId, new Set())
    statusToBoardIds.get(bc.statusId)!.add(bc.boardId)
  }

  // Per-board stats (open cards only — exclude done status)
  const boardCardCounts = new Map<string, number>()
  const boardLastActivity = new Map<string, Date | null>()
  for (const group of cardGroups) {
    const boardIdsForStatus = statusToBoardIds.get(group.statusId)
    if (!boardIdsForStatus) continue
    const updated = new Date(group.lastUpdated * 1000)
    for (const bid of boardIdsForStatus) {
      if (group.statusId !== project.doneStatusId) {
        boardCardCounts.set(bid, (boardCardCounts.get(bid) || 0) + group.count)
      }
      const current = boardLastActivity.get(bid)
      if (!current || updated > current) {
        boardLastActivity.set(bid, updated)
      }
    }
  }

  // Batch-fetch board creator info
  const creatorIds = [...new Set(projectBoards.map(b => b.createdById).filter(Boolean))] as string[]
  const creatorsMap = new Map<string, { id: string, name: string, avatarUrl: string | null }>()
  if (creatorIds.length) {
    const creators = db.select({ id: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
      .from(schema.users)
      .where(inArray(schema.users.id, creatorIds))
      .all()
    for (const c of creators) creatorsMap.set(c.id, c)
  }

  const boards = projectBoards.map(b => ({
    ...b,
    // Normalized here too, or this endpoint hands out the raw JSON *string* the
    // column stores while `boards/[id]` hands out an array for the same board —
    // and the spec promises an array for both.
    hiddenCardFields: normalizeHiddenCardFields(safeParseJson(b.hiddenCardFields, [])),
    // A boolean, as `boards/[id]` returns it; the column stores 0 or 1.
    showSubtasks: !!b.showSubtasks,
    cardCount: boardCardCounts.get(b.id) || 0,
    lastActivity: boardLastActivity.get(b.id)?.toISOString() || null,
    createdBy: b.createdById ? creatorsMap.get(b.createdById) || null : null
  }))

  // Project-level stats (open cards only — exclude done status)
  const openGroups = cardGroups.filter(g => g.statusId !== project.doneStatusId)
  const openCardCount = openGroups.reduce((n, g) => n + g.count, 0)
  const totalCardCount = cardGroups.reduce((n, g) => n + g.count, 0)
  const priorityCounts = { urgent: 0, high: 0, medium: 0, low: 0 }
  for (const group of openGroups) {
    const p = group.priority as keyof typeof priorityCounts
    if (p in priorityCounts) priorityCounts[p] += group.count
  }

  // Per-status card counts
  const statusCardCounts = new Map<string, number>()
  for (const group of cardGroups) {
    statusCardCounts.set(group.statusId, (statusCardCounts.get(group.statusId) || 0) + group.count)
  }

  const projectStatuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, project.id))
    .all()
    .map(c => ({ ...c, cardCount: statusCardCounts.get(c.id) || 0 }))

  const projectTags = db.select().from(schema.tags)
    .where(eq(schema.tags.projectId, project.id))
    .all()

  // Fetch lists
  const projectLists = db.select().from(schema.lists)
    .where(eq(schema.lists.projectId, project.id))
    .all()

  // Batch-fetch list creator info
  const listCreatorIds = [...new Set(projectLists.map(l => l.createdById).filter(Boolean))] as string[]
  for (const id of listCreatorIds) {
    if (!creatorsMap.has(id)) {
      const c = db.select({ id: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .get()
      if (c) creatorsMap.set(c.id, c)
    }
  }

  // List card count = all open project cards (not filtered by board columns)
  const listCardCount = openCardCount

  const lists = projectLists.map(l => ({
    ...l,
    showSubtasks: !!l.showSubtasks,
    cardCount: listCardCount,
    createdBy: l.createdById ? creatorsMap.get(l.createdById) || null : null
  }))

  // Against real membership, not `membership`: that is a synthetic owner row for
  // an admin, and a star left behind by a removed member must not count.
  // `isMember` goes out too, because `role` cannot tell an admin who is not in the
  // project from an owner, and only members may star.
  const isMember = isProjectMember(project.id, user.id)
  const starred = isMember && !!db.select({ id: schema.projectStars.id })
    .from(schema.projectStars)
    .where(and(eq(schema.projectStars.userId, user.id), eq(schema.projectStars.projectId, project.id)))
    .get()

  return {
    ...project,
    isMember,
    starred,
    boards,
    lists,
    statuses: projectStatuses,
    tags: projectTags,
    role: membership.role,
    totalCards: totalCardCount,
    openCards: openCardCount,
    priorityCounts
  }
})
