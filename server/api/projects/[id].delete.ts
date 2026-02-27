import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })

  db.delete(schema.projects).where(eq(schema.projects.id, project.id)).run()
  return { ok: true }
})
