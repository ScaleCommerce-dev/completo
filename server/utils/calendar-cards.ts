import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm'
import { matchesCalendar, normalizeName, type CalendarFilters } from '#shared/utils/calendar-filter'

/**
 * What the Calendar page shows: cards due between `from` and `to` (inclusive
 * `YYYY-MM-DD` days) from every project `userId` is a member of, passing the
 * filters, plus the pickers the filters choose from.
 *
 * - **Membership, not admin.** The calendar lives outside projects, like My
 *   Tasks, so "every project" means the user's own. An admin is not shown every
 *   project on the instance, and a project you cannot open contributes nothing.
 * - **Tags by name, on the card itself.** A sub-task appears when it carries the
 *   tag, not because its parent does.
 * - **No expired done cards,** the retention every view applies.
 * - **Cards without a due date** come back only when a tag is chosen: across
 *   every project they would be most of the database, while for "cards tagged
 *   Redaktionsplan" they are exactly the ones still to be scheduled.
 *
 * With a tag, the path is tags by project (`tags_project_idx`), `card_tags` by
 * tag (`card_tags_tag_idx`), cards by key. Without one, cards by project and
 * due date, within a window of at most a few weeks.
 */
export function calendarCards(userId: string, range: { from: string, to: string }, filters: CalendarFilters) {
  const projectIds = [...memberProjectIds(userId)]
  const projects = projectIds.length
    ? db.select().from(schema.projects).where(inArray(schema.projects.id, projectIds)).orderBy(asc(schema.projects.name)).all()
    : []
  const statuses = projectIds.length
    ? db.select({ id: schema.statuses.id, projectId: schema.statuses.projectId, name: schema.statuses.name, color: schema.statuses.color })
        .from(schema.statuses).where(inArray(schema.statuses.projectId, projectIds)).all()
    : []
  const tagRows = projectIds.length
    ? db.select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color }).from(schema.tags).where(inArray(schema.tags.projectId, projectIds)).all()
    : []
  const memberRows = projectIds.length
    ? db.selectDistinct(memberRefColumns()).from(schema.projectMembers)
        .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
        .where(inArray(schema.projectMembers.projectId, projectIds)).all()
    : []

  const pickers = {
    projects: projects.map(p => ({ id: p.id, name: p.name, slug: p.slug, key: p.key, doneStatusId: p.doneStatusId })),
    statuses,
    // One entry per name, in its first spelling, with that tag's colour.
    tags: (() => {
      const byName = new Map<string, { name: string, color: string }>()
      for (const t of tagRows) {
        if (!byName.has(normalizeName(t.name))) byName.set(normalizeName(t.name), { name: t.name.trim(), color: t.color })
      }
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
    })(),
    people: (() => {
      const { member } = createUserRefs(memberRows)
      return memberRows.map(member).sort((a, b) => a.name.localeCompare(b.name))
    })()
  }
  if (!projectIds.length) return { ...pickers, cards: [], undated: [] }

  const start = new Date(`${range.from}T00:00:00.000Z`)
  const end = new Date(Date.parse(`${range.to}T00:00:00.000Z`) + 86_400_000)
  const inRange = and(gte(schema.cards.dueDate, start), lt(schema.cards.dueDate, end))

  let where
  if (filters.tags.length) {
    const wanted = new Set(filters.tags.map(normalizeName))
    const tagIds = tagRows.filter(t => wanted.has(normalizeName(t.name))).map(t => t.id)
    if (!tagIds.length) return { ...pickers, cards: [], undated: [] }
    // A subquery, not a list of ids read into JS: a tag in use for years has
    // thousands of cards, and only the window's (and the undated) are wanted.
    const tagged = db.select({ id: schema.cardTags.cardId }).from(schema.cardTags).where(inArray(schema.cardTags.tagId, tagIds))
    where = and(inArray(schema.cards.id, tagged), inArray(schema.cards.projectId, projectIds), or(inRange, isNull(schema.cards.dueDate)))
  } else {
    where = and(inArray(schema.cards.projectId, projectIds), inRange)
  }

  const rows = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(where)
    .orderBy(asc(schema.cards.dueDate), asc(schema.cards.id))
    .all()

  const projectById = new Map(projects.map(p => [p.id, p]))
  const live = rows.filter(r => !isExpiredDone(r.cards, projectById.get(r.cards.projectId)!))
  const { ref } = createUserRefs(live.map(r => r.users))
  const statusName = new Map(statuses.map(s => [s.id, s.name]))
  const enriched = enrichCardsWithMetadata(live.map(r => ({ ...r.cards, assignee: ref(r.users) })), { userId })
    .filter(c => matchesCalendar(c, statusName.get(c.statusId), filters))

  // Where a card "lives": the first board of its project, in board order, that
  // shows its status. A card is on every board whose columns include its
  // status, or on none, so this names the likeliest one rather than the only one.
  const usedProjects = [...new Set(enriched.map(c => c.projectId))]
  const boards = usedProjects.length
    ? db.select({ id: schema.boards.id, projectId: schema.boards.projectId, name: schema.boards.name, slug: schema.boards.slug, statusId: schema.boardColumns.statusId })
        .from(schema.boards)
        .innerJoin(schema.boardColumns, eq(schema.boardColumns.boardId, schema.boards.id))
        .where(inArray(schema.boards.projectId, usedProjects))
        .orderBy(asc(schema.boards.position))
        .all()
    : []
  const boardByStatus = new Map<string, { id: string, name: string, slug: string }>()
  for (const b of boards) {
    const key = `${b.projectId}:${b.statusId}`
    if (!boardByStatus.has(key)) boardByStatus.set(key, { id: b.id, name: b.name, slug: b.slug })
  }
  const withBoard = enriched.map(c => ({ ...c, board: boardByStatus.get(`${c.projectId}:${c.statusId}`) ?? null }))

  return {
    ...pickers,
    cards: withBoard.filter(c => c.dueDate),
    undated: withBoard.filter(c => !c.dueDate)
  }
}
