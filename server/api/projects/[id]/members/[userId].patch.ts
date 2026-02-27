import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project, user } = await resolveProject(event, { auth: 'owner' })
  const userId = getRouterParam(event, 'userId')!

  const body = await readBody(event)
  const role = body?.role
  if (role !== 'owner' && role !== 'member') {
    throw createError({ statusCode: 400, message: 'Role must be "owner" or "member"' })
  }

  const targetMembership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, project.id),
      eq(schema.projectMembers.userId, userId)
    ))
    .get()

  if (!targetMembership) {
    throw createError({ statusCode: 404, message: 'Member not found' })
  }

  // Prevent demoting the last owner
  if (targetMembership.role === 'owner' && role === 'member') {
    const ownerCount = db.select().from(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, project.id),
        eq(schema.projectMembers.role, 'owner')
      ))
      .all()
      .length

    if (ownerCount <= 1) {
      throw createError({ statusCode: 400, message: 'Cannot demote the last owner' })
    }
  }

  db.update(schema.projectMembers)
    .set({ role })
    .where(eq(schema.projectMembers.id, targetMembership.id))
    .run()

  // In-app notification
  createNotification({
    userId,
    type: 'role_changed',
    title: 'Role changed',
    message: `Your role in ${project.name} was changed to ${role}`,
    linkUrl: `/projects/${project.slug}`,
    projectId: project.id,
    actorId: user.id
  })

  return { ok: true, role }
})
