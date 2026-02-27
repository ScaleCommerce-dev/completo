import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { name, slug, tagFilters } = await readBody<{ name?: string, slug?: string, tagFilters?: string[] }>(event)

  if (!name && !slug && tagFilters === undefined) {
    throw createError({ statusCode: 400, message: 'Name, slug, or tagFilters is required' })
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

  db.update(schema.boards).set(updates).where(eq(schema.boards.id, board.id)).run()
  return db.select().from(schema.boards).where(eq(schema.boards.id, board.id)).get()
})
