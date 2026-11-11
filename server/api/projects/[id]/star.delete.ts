import { and, eq } from 'drizzle-orm'

/** Unstar a project. Idempotent, and open to anyone who can see the project. */
export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)

  db.delete(schema.projectStars)
    .where(and(
      eq(schema.projectStars.userId, user.id),
      eq(schema.projectStars.projectId, project.id)
    ))
    .run()

  return { starred: false }
})
