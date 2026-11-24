import { eq } from 'drizzle-orm'

/**
 * Archive a project (CF-420). Owners and admins, like every other project setting.
 *
 * It sets `archivedAt` and touches nothing else: statuses, cards, tags, members
 * and stars are all left as they are, which is what makes `DELETE` on this route
 * a complete restore. Archiving an archived project keeps its first timestamp.
 */
export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })

  if (!project.archivedAt) {
    db.update(schema.projects)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projects.id, project.id))
      .run()
  }

  return db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get()
})
