import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { projectId } = await readBody<{ projectId: string }>(event)

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'projectId is required' })
  }

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
