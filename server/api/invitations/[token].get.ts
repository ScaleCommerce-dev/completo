import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!

  const invitation = db.select({
    email: schema.projectInvitations.email,
    expiresAt: schema.projectInvitations.expiresAt,
    projectName: schema.projects.name,
    inviterName: schema.users.name
  })
    .from(schema.projectInvitations)
    .innerJoin(schema.projects, eq(schema.projectInvitations.projectId, schema.projects.id))
    .innerJoin(schema.users, eq(schema.projectInvitations.invitedById, schema.users.id))
    .where(eq(schema.projectInvitations.token, token))
    .get()

  if (!invitation || invitation.expiresAt < new Date()) {
    throw createError({ statusCode: 404, message: 'Invitation not found or expired' })
  }

  return {
    email: invitation.email,
    projectName: invitation.projectName,
    inviterName: invitation.inviterName
  }
})
