import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { name, slug, sortField, sortDirection, tagFilters, statusFilters, assigneeFilters, priorityFilters, showSubtasks } = await readBody<{
    name?: string
    slug?: string
    sortField?: string | null
    sortDirection?: string | null
    tagFilters?: string[]
    statusFilters?: string[]
    assigneeFilters?: string[]
    priorityFilters?: string[]
    showSubtasks?: boolean
  }>(event)

  if (!name && !slug && sortField === undefined && sortDirection === undefined && tagFilters === undefined && statusFilters === undefined && assigneeFilters === undefined && priorityFilters === undefined && showSubtasks === undefined) {
    throw createError({ statusCode: 400, message: 'Name, slug, sort fields, or filters required' })
  }

  const updates: Record<string, string | number | null> = {}

  if (name) {
    updates.name = name
  }

  if (slug) {
    if (!isValidSlug(slug)) {
      throw createError({ statusCode: 400, message: 'Invalid slug format' })
    }
    // Check uniqueness within project
    const existing = db.select({ id: schema.lists.id })
      .from(schema.lists)
      .where(and(
        eq(schema.lists.projectId, list.projectId),
        eq(schema.lists.slug, slug),
        ne(schema.lists.id, list.id)
      ))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: 'Slug already taken in this project' })
    }
    updates.slug = slug
  }

  if (sortField !== undefined) {
    if (sortField !== null && !SORTABLE_LIST_FIELDS.has(sortField)) {
      throw createError({ statusCode: 400, message: 'Invalid sort field' })
    }
    updates.sortField = sortField
  }

  if (sortDirection !== undefined) {
    if (sortDirection !== null && sortDirection !== 'asc' && sortDirection !== 'desc') {
      throw createError({ statusCode: 400, message: 'Invalid sort direction' })
    }
    updates.sortDirection = sortDirection
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

  if (showSubtasks !== undefined) {
    if (typeof showSubtasks !== 'boolean') {
      throw createError({ statusCode: 400, message: 'showSubtasks must be a boolean' })
    }
    updates.showSubtasks = showSubtasks ? 1 : 0
  }

  db.update(schema.lists).set(updates).where(eq(schema.lists.id, list.id)).run()

  // Sort, filters, name and slug all change what this list shows.
  emitViewChange(list.projectId)

  return db.select().from(schema.lists).where(eq(schema.lists.id, list.id)).get()
})
