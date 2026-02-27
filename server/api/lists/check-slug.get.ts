import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const query = getQuery(event)
  const slug = (query.slug as string || '').toLowerCase()
  const projectId = query.projectId as string
  const exclude = query.exclude as string | undefined

  if (!slug || !projectId) {
    return { available: false }
  }

  try {
    requireProjectMember(projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const conditions = [
    eq(schema.lists.projectId, projectId),
    eq(schema.lists.slug, slug)
  ]
  if (exclude) {
    conditions.push(ne(schema.lists.id, exclude))
  }

  const existing = db.select({ id: schema.lists.id })
    .from(schema.lists)
    .where(and(...conditions))
    .get()

  return { available: !existing }
})
