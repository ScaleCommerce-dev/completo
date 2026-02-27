import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })
  const invitationId = getRouterParam(event, 'invitationId')!

  const invitation = db.select()
    .from(schema.projectInvitations)
    .where(and(
      eq(schema.projectInvitations.id, invitationId),
      eq(schema.projectInvitations.projectId, project.id)
    ))
    .get()

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }

  db.delete(schema.projectInvitations)
    .where(eq(schema.projectInvitations.id, invitationId))
    .run()

  return { ok: true }
})
