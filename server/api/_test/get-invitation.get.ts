export default defineEventHandler(async (event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const { email } = getQuery(event) as { email?: string }
  if (!email) {
    throw createError({ statusCode: 400, message: 'email is required' })
  }

  const invitation = db.select()
    .from(schema.projectInvitations)
    .all()
    .find(inv => inv.email.toLowerCase() === email.toLowerCase() && inv.expiresAt > new Date())

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'No pending invitation found' })
  }

  return { token: invitation.token, projectId: invitation.projectId, email: invitation.email }
})
