import { eq } from 'drizzle-orm'

/** Restore an archived project (CF-420). Idempotent; owners and admins. */
export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })

  db.update(schema.projects)
    .set({ archivedAt: null })
    .where(eq(schema.projects.id, project.id))
    .run()

  return db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get()
})
