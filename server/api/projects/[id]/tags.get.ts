import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event)

  return db.select().from(schema.tags)
    .where(eq(schema.tags.projectId, project.id))
    .all()
})
