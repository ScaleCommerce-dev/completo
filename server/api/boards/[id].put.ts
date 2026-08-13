import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { name, slug, tagFilters, statusFilters, assigneeFilters, priorityFilters, showDescription } = await readBody<{
    name?: string
    slug?: string
    tagFilters?: string[]
    statusFilters?: string[]
    assigneeFilters?: string[]
    priorityFilters?: string[]
    showDescription?: boolean
  }>(event)

  if (!name && !slug && tagFilters === undefined && statusFilters === undefined && assigneeFilters === undefined && priorityFilters === undefined && showDescription === undefined) {
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

  // Stored 0/1 to match the rest of the schema; coerced here so a JSON `true`
  // and a stray `1` both land as the integer the column expects.
  if (showDescription !== undefined) {
    updates.showDescription = showDescription ? 1 : 0
  }

  db.update(schema.boards).set(updates).where(eq(schema.boards.id, board.id)).run()
  const updated = db.select().from(schema.boards).where(eq(schema.boards.id, board.id)).get()
  return updated ? { ...updated, showDescription: !!updated.showDescription } : updated
})
