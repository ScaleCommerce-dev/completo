import { eq, inArray } from 'drizzle-orm'

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
  const allCards = db.select().from(schema.cards)
    .where(eq(schema.cards.projectId, project.id))
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
  for (const card of allCards) {
    const boardIdsForStatus = statusToBoardIds.get(card.statusId)
    if (!boardIdsForStatus) continue
    for (const bid of boardIdsForStatus) {
      if (card.statusId !== project.doneStatusId) {
        boardCardCounts.set(bid, (boardCardCounts.get(bid) || 0) + 1)
      }
      const current = boardLastActivity.get(bid)
      if (!current || card.updatedAt > current) {
        boardLastActivity.set(bid, card.updatedAt)
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
    cardCount: boardCardCounts.get(b.id) || 0,
    lastActivity: boardLastActivity.get(b.id)?.toISOString() || null,
    createdBy: b.createdById ? creatorsMap.get(b.createdById) || null : null
  }))

  // Project-level stats (open cards only — exclude done status)
  const openCards = project.doneStatusId
    ? allCards.filter(c => c.statusId !== project.doneStatusId)
    : allCards
  const priorityCounts = { urgent: 0, high: 0, medium: 0, low: 0 }
  for (const card of openCards) {
    const p = card.priority as keyof typeof priorityCounts
    if (p in priorityCounts) priorityCounts[p]++
  }

  // Per-status card counts
  const statusCardCounts = new Map<string, number>()
  for (const card of allCards) {
    statusCardCounts.set(card.statusId, (statusCardCounts.get(card.statusId) || 0) + 1)
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
  const listCardCount = openCards.length

  const lists = projectLists.map(l => ({
    ...l,
    cardCount: listCardCount,
    createdBy: l.createdById ? creatorsMap.get(l.createdById) || null : null
  }))

  return {
    ...project,
    boards,
    lists,
    statuses: projectStatuses,
    tags: projectTags,
    role: membership.role,
    totalCards: allCards.length,
    openCards: openCards.length,
    priorityCounts
  }
})
