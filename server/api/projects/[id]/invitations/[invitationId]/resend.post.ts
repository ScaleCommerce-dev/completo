import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project, user } = await resolveProject(event, { auth: 'owner' })
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

  // Generate fresh token and reset expiry (works even on expired invitations)
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  db.update(schema.projectInvitations)
    .set({ token, expiresAt })
    .where(eq(schema.projectInvitations.id, invitationId))
    .run()

  // Send invitation email
  if (isEmailEnabled()) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000'
    const registerUrl = `${baseUrl}/register?invitation=${token}`
    try {
      await sendAccountInviteEmail(invitation.email, user.name, project.name, registerUrl)
    } catch (err) {
      console.error('Failed to send invitation email:', (err as Error).message)
    }
  }

  return { ok: true }
})
