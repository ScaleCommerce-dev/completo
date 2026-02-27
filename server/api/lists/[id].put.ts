import { eq, and, ne } from 'drizzle-orm'

const SORTABLE_FIELDS = new Set(['ticketId', 'title', 'status', 'priority', 'assignee', 'createdAt', 'updatedAt'])

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { name, slug, sortField, sortDirection, tagFilters } = await readBody<{
    name?: string
    slug?: string
    sortField?: string | null
    sortDirection?: string | null
    tagFilters?: string[]
  }>(event)

  if (!name && !slug && sortField === undefined && sortDirection === undefined && tagFilters === undefined) {
    throw createError({ statusCode: 400, message: 'Name, slug, sort fields, or tagFilters required' })
  }

  const updates: Record<string, string | null> = {}

  if (name) {
    updates.name = name
  }

  if (slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
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
    if (sortField !== null && !SORTABLE_FIELDS.has(sortField)) {
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

  db.update(schema.lists).set(updates).where(eq(schema.lists.id, list.id)).run()
  return db.select().from(schema.lists).where(eq(schema.lists.id, list.id)).get()
})
