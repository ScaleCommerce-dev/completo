import { and, asc, eq, gte, inArray, isNull, lt, notInArray } from 'drizzle-orm'
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
 * - **Only cards with a due date are drawn.** The ones that pass the filters but
 *   have none come back as `undatedIds`, so the page can say how many the grid
 *   cannot show. Ids, not a count, so a live update can add or remove one card
 *   and keep the number exact without re-reading the page. Not a list: a "No
 *   date" list was tried and removed, because it appeared only with a tag
 *   chosen, which read as a bug with any other filter, and it could not
 *   schedule anything, since a card could not be dragged from it onto a day.
 *   Done cards are left out of it: the number answers "what is missing from the
 *   plan", and a finished card without a date is not.
 *
 * With a tag, the path is tags by project (`tags_project_idx`), `card_tags` by
 * tag (`card_tags_tag_idx`), cards by key. Without one, cards by project and
 * due date, within a window of at most a few weeks.
 */
export function calendarCards(userId: string, range: { from: string, to: string }, filters: CalendarFilters) {
  // Archived projects (CF-420) contribute no cards and no picker entries. They
  // are named apart (`archivedProjects`), because a saved calendar may filter by
  // one: without them the page could only call it "a project you are not a
  // member of", and offer to strip it from the filters for good.
  const archived = archivedProjectIds()
  const allMemberIds = [...memberProjectIds(userId)]
  const projectIds = allMemberIds.filter(id => !archived.has(id))
  const archivedMemberIds = allMemberIds.filter(id => archived.has(id))
  const archivedProjects = archivedMemberIds.length
    ? db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects)
        .where(inArray(schema.projects.id, archivedMemberIds)).orderBy(asc(schema.projects.name)).all()
    : []
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
    archivedProjects,
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
  if (!projectIds.length) return { ...pickers, cards: [], undatedIds: [] }

  const start = new Date(`${range.from}T00:00:00.000Z`)
  const end = new Date(Date.parse(`${range.to}T00:00:00.000Z`) + 86_400_000)
  const inRange = and(gte(schema.cards.dueDate, start), lt(schema.cards.dueDate, end))

  // The cards a chosen tag allows, as a subquery rather than ids read into JS:
  // a tag in use for years has thousands of cards, and only a few are wanted.
  let tagged
  if (filters.tags.length) {
    const wanted = new Set(filters.tags.map(normalizeName))
    const tagIds = tagRows.filter(t => wanted.has(normalizeName(t.name))).map(t => t.id)
    if (!tagIds.length) return { ...pickers, cards: [], undatedIds: [] }
    tagged = db.select({ id: schema.cardTags.cardId }).from(schema.cardTags).where(inArray(schema.cardTags.tagId, tagIds))
  }
  const inScope = and(inArray(schema.cards.projectId, projectIds), tagged ? inArray(schema.cards.id, tagged) : undefined)
  const where = and(inScope, inRange)

  const rows = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(where)
    .orderBy(asc(schema.cards.dueDate), asc(schema.cards.id))
    .all()

  const projectById = new Map(projects.map(p => [p.id, p]))
  const live = rows.filter(r => !isExpiredDone(r.cards, projectById.get(r.cards.projectId)!))
  const { ref } = createUserRefs(live.map(r => r.users))
  const statusName = new Map(statuses.map(s => [s.id, s.name]))
  const doneStatusIds = new Set(projects.flatMap(p => (p.doneStatusId ? [p.doneStatusId] : [])))
  const statusFacts = (statusId: string) => ({ name: statusName.get(statusId), isDone: doneStatusIds.has(statusId) })
  const enriched = enrichCardsWithMetadata(live.map(r => ({ ...r.cards, assignee: ref(r.users) })), { userId })
    .filter(c => matchesCalendar(c, statusFacts(c.statusId), filters))

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

  // Narrow rows: only what the filter test reads. The tag test already ran in
  // SQL (`tagged`), so it is not repeated here with tags the rows do not carry.
  const undatedIds = db.select({ id: schema.cards.id, projectId: schema.cards.projectId, statusId: schema.cards.statusId, assigneeId: schema.cards.assigneeId })
    .from(schema.cards)
    .where(and(inScope, isNull(schema.cards.dueDate), doneStatusIds.size ? notInArray(schema.cards.statusId, [...doneStatusIds]) : undefined))
    .all()
    .filter(c => matchesCalendar(c, statusFacts(c.statusId), { ...filters, tags: [] }))
    .map(c => c.id)

  return {
    ...pickers,
    cards: withBoard,
    undatedIds
  }
}
