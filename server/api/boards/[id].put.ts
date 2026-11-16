import { eq, and, ne } from 'drizzle-orm'
import { boardUpdateSchema, storedFilter } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { name, slug, tagFilters, statusFilters, assigneeFilters, priorityFilters, hiddenCardFields, showSubtasks } = await readBodyAs(event, boardUpdateSchema)

  const updates: Record<string, string | number | null> = {}

  if (name !== undefined) {
    updates.name = name
  }

  if (slug !== undefined) {
    // Check uniqueness within project
    const existing = db.select({ id: schema.boards.id })
      .from(schema.boards)
      .where(and(
        eq(schema.boards.projectId, board.projectId),
        eq(schema.boards.slug, slug),
        ne(schema.boards.id, board.id)
      ))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: 'Slug already taken in this project' })
    }
    updates.slug = slug
  }

  if (tagFilters !== undefined) {
    updates.tagFilters = storedFilter(tagFilters)
  }

  if (statusFilters !== undefined) {
    updates.statusFilters = storedFilter(statusFilters)
  }

  if (assigneeFilters !== undefined) {
    updates.assigneeFilters = storedFilter(assigneeFilters)
  }

  if (priorityFilters !== undefined) {
    updates.priorityFilters = storedFilter(priorityFilters)
  }

  if (hiddenCardFields !== undefined) {
    const hidden = normalizeHiddenCardFields(hiddenCardFields)
    updates.hiddenCardFields = hidden.length ? JSON.stringify(hidden) : null
  }

  if (showSubtasks !== undefined) {
    updates.showSubtasks = showSubtasks ? 1 : 0
  }

  db.update(schema.boards).set(updates).where(eq(schema.boards.id, board.id)).run()

  // Filters, hidden fields, name and slug all change what this board shows.
  emitViewChange(board.projectId)

  const updated = db.select().from(schema.boards).where(eq(schema.boards.id, board.id)).get()
  return updated ? { ...updated, hiddenCardFields: normalizeHiddenCardFields(safeParseJson(updated.hiddenCardFields, [])) } : updated
})
