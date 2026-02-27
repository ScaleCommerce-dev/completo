import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event, { auth: 'owner' })
  const userId = getRouterParam(event, 'userId')

  // Check if target is an owner and if they're the last one
  const targetMembership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, project.id),
      eq(schema.projectMembers.userId, userId!)
    ))
    .get()

  if (targetMembership?.role === 'owner') {
    const ownerCount = db.select().from(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, project.id),
        eq(schema.projectMembers.role, 'owner')
      ))
      .all()
      .length

    if (ownerCount <= 1) {
      throw createError({ statusCode: 400, message: 'Cannot remove the last owner' })
    }
  }

  // Create notification BEFORE deletion (user loses access after)
  createNotification({
    userId: userId!,
    type: 'member_removed',
    title: 'Removed from project',
    message: `${user.name} removed you from ${project.name}`,
    projectId: project.id,
    actorId: user.id
  })

  db.delete(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, project.id),
      eq(schema.projectMembers.userId, userId!)
    ))
    .run()

  return { ok: true }
})
