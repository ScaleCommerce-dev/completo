import { and, eq, asc } from 'drizzle-orm'
import { cardDuplicateSchema } from '#shared/schemas/card'

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
 * **Sub-tasks come along.** A template is often a checklist of steps, and steps
 * that need an owner or a status of their own are sub-tasks: a copy of the
 * parent gets a copy of each, under it, in the target project — sub-tasks live
 * in their parent's project, and the copy's project is the target. Each starts
 * in that project's first status, like a sub-task added by hand, with its title
 * and its description (task lists reset) and nothing else, for the same reasons
 * as the card itself. A copied *sub-task* stays under its parent when the copy
 * lands in the same project, and is an ordinary card anywhere else.
 *
 * Goes through createCard, so membership, live board updates and the usual
 * notifications behave exactly as for a card created by hand.
 */
export default defineEventHandler(async (event) => {
  const { user, card: source } = await resolveCard(event)
  const body = await readBodyAs(event, cardDuplicateSchema)
  const title = body.title

  // The target board may be in another project, but only one the caller is a
  // member of: reading the source is checked by resolveCard, writing into the
  // target is checked here. A board the caller can't see is a 404, not a 403, so
  // probing ids reveals nothing (same rule as every other project resource).
  const board = db.select().from(schema.boards).where(eq(schema.boards.id, body.boardId)).get()
  if (!board) {
    throw createError({ statusCode: 404, message: 'Board not found' })
  }
  try {
    requireProjectMember(board.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
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

  const projectTags = new Map(
    db.select({ id: schema.tags.id, name: schema.tags.name }).from(schema.tags)
      .where(eq(schema.tags.projectId, targetProjectId))
      .all()
      .map(t => [t.id, t])
  )
  const requestedTagIds = body.tagIds ?? safeParseJson<string[]>(board.tagFilters, [])
  for (const tagId of requestedTagIds) {
    if (!projectTags.has(tagId)) {
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
      priority,
      parentId: source.parentId && source.projectId === targetProjectId ? source.parentId : undefined
    },
    // In the card's own transaction: a copy that exists without the tags would be
    // invisible on a board that filters by them.
    tags: tagIds.map(id => projectTags.get(id)!)
  })

  // Where a sub-task added by hand starts (`defaultStatusId`), not the board column
  // the copy went to.
  const subtasks = db.select({ title: schema.cards.title, description: schema.cards.description })
    .from(schema.cards)
    .where(and(eq(schema.cards.parentId, source.id), eq(schema.cards.projectId, source.projectId)))
    .orderBy(asc(schema.cards.id))
    .all()
  if (subtasks.length) {
    const firstStatusId = defaultStatusId(targetProjectId)!
    for (const sub of subtasks) {
      createCard({
        projectId: targetProjectId,
        userId: user.id,
        userName: user.name,
        body: {
          statusId: firstStatusId,
          title: sub.title,
          description: resetTaskList(sub.description) || undefined,
          parentId: copy.id
        }
      })
    }
  }

  setResponseStatus(event, 201)
  return { ...copy, tagIds, boardId: board.id, projectId: targetProjectId, subtaskCount: subtasks.length }
})
