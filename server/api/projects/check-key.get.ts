import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  const query = getQuery(event)
  const key = (query.key as string || '').toUpperCase()
  const exclude = query.exclude as string | undefined

  if (!key) {
    return { available: false }
  }

  const existing = db.select({ id: schema.projects.id })
    .from(schema.projects)
    .where(exclude
      ? and(eq(schema.projects.key, key), ne(schema.projects.id, exclude))
      : eq(schema.projects.key, key))
    .get()

  return { available: !existing }
})
