import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return db.select()
    .from(schema.aiSkills)
    .orderBy(asc(schema.aiSkills.position))
    .all()
})
