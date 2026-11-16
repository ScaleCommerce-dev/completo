import { eq, and } from 'drizzle-orm'
import { myTasksCollapseSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { projectId } = await readBodyAs(event, myTasksCollapseSchema)

  // Verify user is a member (or admin) — return 404 to avoid leaking project existence
  try {
    requireProjectMember(projectId, user.id, { isAdmin: !!user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const existing = db.select().from(schema.myTasksCollapsed)
    .where(and(
      eq(schema.myTasksCollapsed.userId, user.id),
      eq(schema.myTasksCollapsed.projectId, projectId)
    ))
    .get()

  if (existing) {
    db.delete(schema.myTasksCollapsed)
      .where(eq(schema.myTasksCollapsed.id, existing.id))
      .run()
    return { collapsed: false }
  } else {
    db.insert(schema.myTasksCollapsed).values({
      userId: user.id,
      projectId
    }).run()
    return { collapsed: true }
  }
})
