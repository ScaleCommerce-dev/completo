import { eq, and, asc } from 'drizzle-orm'

/**
 * Duplicate a card into a board — of its own project or of any other project the
 * caller is a member of. This is the "template card" workflow: a card tagged e.g.
 * "Template" holds a recurring checklist, and each run is a copy dropped into the
 * board where the work happens.
 *
 * What a copy carries is deliberately narrow: the title the caller chose, and the
 * description with every task-list box reset to open, so the checklist starts
 * over. Tags, assignee, priority, due date, attachments and comments are NOT
 * copied — the template's tags would make the copy a template too, and in
 * another project they would not even exist. Mentions in the description stay as
 * text; createCard notifies only those who are members of the target project.
 *
 * A board is a view, so a card only appears on it if it survives the board's
 * filters. The copy is therefore placed to be visible there: the first of the
 * board's columns that passes its status filter, the tags the caller picked
 * (defaulting to the board's tag filter — a board shows a card with ANY of
 * them), and a priority the board's priority filter admits. An assignee filter
 * can't be satisfied without assigning someone, so it is left to the caller.
 *
 * Goes through createCard, so membership, live board updates and the usual
 * notifications behave exactly as for a card created by hand.
 */
export default defineEventHandler(async (event) => {
  const { user, card: source } = await resolveCard(event)
  const body = await readBody<{ title?: string, boardId?: string, tagIds?: string[] }>(event)

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }
  if (!body.boardId) {
    throw createError({ statusCode: 400, message: 'boardId is required' })
  }

  // The target board may be in another project, but only one the caller is a
  // member of: reading the source is checked by resolveCard, writing into the
  // target is checked here. A board the caller can't see is a 404, not a 403, so
  // probing ids reveals nothing (same rule as every other project resource).
  const board = db.select().from(schema.boards)
    .where(eq(schema.boards.id, body.boardId))
    .get()
  const isTargetMember = !!board && (user.isAdmin || !!db.select({ id: schema.projectMembers.id })
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, board.projectId), eq(schema.projectMembers.userId, user.id)))
    .get())
  if (!board || !isTargetMember) {
    throw createError({ statusCode: 404, message: 'Board not found' })
  }
  const targetProjectId = board.projectId

  const statusFilter = new Set<string>(safeParseJson(board.statusFilters, []))
  const column = db.select({ statusId: schema.boardColumns.statusId })
    .from(schema.boardColumns)
    .where(eq(schema.boardColumns.boardId, board.id))
    .orderBy(asc(schema.boardColumns.position))
    .all()
    .find(c => !statusFilter.size || statusFilter.has(c.statusId))
  if (!column) {
    throw createError({ statusCode: 400, message: 'This board has no column a card could go into' })
  }

  const projectTagIds = new Set(
    db.select({ id: schema.tags.id }).from(schema.tags)
      .where(eq(schema.tags.projectId, targetProjectId))
      .all()
      .map(t => t.id)
  )
  const requestedTagIds = Array.isArray(body.tagIds) ? body.tagIds : safeParseJson<string[]>(board.tagFilters, [])
  for (const tagId of requestedTagIds) {
    if (typeof tagId !== 'string' || !projectTagIds.has(tagId)) {
      throw createError({ statusCode: 400, message: 'Tag does not belong to this project' })
    }
  }
  const tagIds = [...new Set(requestedTagIds)]

  const allowedPriorities = safeParseJson<string[]>(board.priorityFilters, [])
  const priority = (!allowedPriorities.length || allowedPriorities.includes('medium')
    ? 'medium'
    : allowedPriorities[0]) as 'low' | 'medium' | 'high' | 'urgent'

  const copy = createCard({
    projectId: targetProjectId,
    userId: user.id,
    userName: user.name,
    body: {
      statusId: column.statusId,
      title,
      description: resetTaskList(source.description) || undefined,
      priority
    }
  })

  if (tagIds.length) {
    db.transaction(() => {
      for (const tagId of tagIds) {
        db.insert(schema.cardTags).values({ id: crypto.randomUUID(), cardId: copy.id, tagId }).run()
      }
    })
    // createCard already announced the card; announce it again now it carries
    // the tags that decide which boards show it.
    emitCardChange(copy.id, targetProjectId)
  }

  setResponseStatus(event, 201)
  return { ...copy, tagIds, boardId: board.id, projectId: targetProjectId }
})
