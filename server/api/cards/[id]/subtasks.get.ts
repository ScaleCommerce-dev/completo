import { eq, inArray } from 'drizzle-orm'

/**
 * A card's sub-task side, for the card panel: its sub-tasks, its parent, the
 * project's statuses (to name each sub-task's), and the progress as the board
 * counts it.
 *
 * The panel used to read all of `GET /api/cards/:id` for this on every open, with
 * the project's members, its tags and the card's own fields, which the view it
 * was opened from already holds.
 */
export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)

  const project = db.select({ id: schema.projects.id, key: schema.projects.key, doneStatusId: schema.projects.doneStatusId })
    .from(schema.projects)
    .where(eq(schema.projects.id, card.projectId))
    .get()

  const statuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, card.projectId))
    .all()

  const subtaskRows = subtasksOf(card.id)
  const tickets = cardTickets([...subtaskRows.map(c => c.id), ...(card.parentId ? [card.parentId] : [])])

  const assigneeIds = [...new Set(subtaskRows.map(c => c.assigneeId).filter((x): x is string => !!x))]
  const assignees = assigneeIds.length
    ? db.select(memberRefColumns()).from(schema.users).where(inArray(schema.users.id, assigneeIds)).all()
    : []
  const { member } = createUserRefs(assignees)
  const byId = new Map(assignees.map(a => [a.id, member(a)]))

  return {
    id: card.id,
    parentId: card.parentId,
    project: project ?? null,
    statuses,
    subtaskCards: subtaskRows.map(c => ({
      ...c,
      ticket: tickets.get(c.id)!,
      assignee: c.assigneeId ? byId.get(c.assigneeId) ?? null : null
    })),
    subtasks: subtaskProgress([card.id]).get(card.id) ?? null
  }
})
