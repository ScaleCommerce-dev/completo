import { eq, and, ne } from 'drizzle-orm'
import { listUpdateSchema, storedFilter } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { name, slug, sortField, sortDirection, tagFilters, statusFilters, assigneeFilters, priorityFilters, showSubtasks } = await readBodyAs(event, listUpdateSchema)

  const updates: Record<string, string | number | null> = {}

  if (name !== undefined) {
    updates.name = name
  }

  if (slug !== undefined) {
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
    updates.sortField = sortField
  }

  if (sortDirection !== undefined) {
    updates.sortDirection = sortDirection
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

  if (showSubtasks !== undefined) {
    updates.showSubtasks = showSubtasks ? 1 : 0
  }

  db.update(schema.lists).set(updates).where(eq(schema.lists.id, list.id)).run()

  // Sort, filters, name and slug all change what this list shows.
  emitViewChange(list.projectId)

  return db.select().from(schema.lists).where(eq(schema.lists.id, list.id)).get()
})
