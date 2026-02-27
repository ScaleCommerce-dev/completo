import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  const query = getQuery(event)
  const slug = (query.slug as string || '').toLowerCase()
  const exclude = query.exclude as string | undefined

  if (!slug) {
    return { available: false }
  }

  const existing = db.select({ id: schema.projects.id })
    .from(schema.projects)
    .where(exclude
      ? and(eq(schema.projects.slug, slug), ne(schema.projects.id, exclude))
      : eq(schema.projects.slug, slug))
    .get()

  return { available: !existing }
})
