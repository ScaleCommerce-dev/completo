import { eq, gt } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const now = new Date()

  // Get non-expired invitations with project + inviter info
  const invitations = db.select({
    id: schema.projectInvitations.id,
    email: schema.projectInvitations.email,
    projectId: schema.projectInvitations.projectId,
    projectName: schema.projects.name,
    inviterName: schema.users.name,
    expiresAt: schema.projectInvitations.expiresAt,
    createdAt: schema.projectInvitations.createdAt
  })
    .from(schema.projectInvitations)
    .innerJoin(schema.projects, eq(schema.projectInvitations.projectId, schema.projects.id))
    .innerJoin(schema.users, eq(schema.projectInvitations.invitedById, schema.users.id))
    .where(gt(schema.projectInvitations.expiresAt, now))
    .all()

  // Filter out invitations where the email already exists as a registered user
  const allEmails = [...new Set(invitations.map(inv => inv.email.toLowerCase()))]
  const registeredEmails = new Set<string>()
  for (const email of allEmails) {
    const user = db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get()
    if (user) registeredEmails.add(email)
  }

  return invitations
    .filter(inv => !registeredEmails.has(inv.email.toLowerCase()))
    .map(inv => ({
      id: inv.id,
      email: inv.email,
      projectId: inv.projectId,
      projectName: inv.projectName,
      inviterName: inv.inviterName,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt
    }))
})
