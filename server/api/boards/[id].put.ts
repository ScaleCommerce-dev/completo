import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { name, slug, tagFilters, statusFilters, assigneeFilters, priorityFilters, hiddenCardFields } = await readBody<{
    name?: string
    slug?: string
    tagFilters?: string[]
    statusFilters?: string[]
    assigneeFilters?: string[]
    priorityFilters?: string[]
    hiddenCardFields?: string[]
  }>(event)

  if (!name && !slug && tagFilters === undefined && statusFilters === undefined && assigneeFilters === undefined && priorityFilters === undefined && hiddenCardFields === undefined) {
    throw createError({ statusCode: 400, message: 'Name, slug, filters, or display settings required' })
  }

  const updates: Record<string, string | number | null> = {}

  if (name) {
    updates.name = name
  }

  if (slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw createError({ statusCode: 400, message: 'Invalid slug format' })
    }
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
    updates.tagFilters = tagFilters.length ? JSON.stringify(tagFilters) : null
  }

  if (statusFilters !== undefined) {
    updates.statusFilters = statusFilters.length ? JSON.stringify(statusFilters) : null
  }

  if (assigneeFilters !== undefined) {
    updates.assigneeFilters = assigneeFilters.length ? JSON.stringify(assigneeFilters) : null
  }

  if (priorityFilters !== undefined) {
    updates.priorityFilters = priorityFilters.length ? JSON.stringify(priorityFilters) : null
  }

  // Unknown *keys* are dropped rather than rejected — a board saved by a newer
  // release naming a field this one has never heard of should lose that setting,
  // not fail to save. A wrong *shape* is a different thing: `normalizeHiddenCardFields`
  // answers `[]` for a string, a number or null, so sending one silently cleared
  // the board's display settings and returned 200 as if it had worked.
  if (hiddenCardFields !== undefined) {
    if (!Array.isArray(hiddenCardFields)) {
      throw createError({ statusCode: 400, message: 'hiddenCardFields must be an array' })
    }
    const hidden = normalizeHiddenCardFields(hiddenCardFields)
    updates.hiddenCardFields = hidden.length ? JSON.stringify(hidden) : null
  }

  db.update(schema.boards).set(updates).where(eq(schema.boards.id, board.id)).run()

  // Filters, hidden fields, name and slug all change what this board shows.
  emitViewChange(board.projectId)

  const updated = db.select().from(schema.boards).where(eq(schema.boards.id, board.id)).get()
  return updated ? { ...updated, hiddenCardFields: normalizeHiddenCardFields(safeParseJson(updated.hiddenCardFields, [])) } : updated
})
