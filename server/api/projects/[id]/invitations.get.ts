import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })

  const now = new Date()
  const invitations = db.select({
    id: schema.projectInvitations.id,
    email: schema.projectInvitations.email,
    role: schema.projectInvitations.role,
    createdAt: schema.projectInvitations.createdAt,
    expiresAt: schema.projectInvitations.expiresAt,
    invitedByName: schema.users.name
  })
    .from(schema.projectInvitations)
    .innerJoin(schema.users, eq(schema.projectInvitations.invitedById, schema.users.id))
    .where(eq(schema.projectInvitations.projectId, project.id))
    .all()
    .filter(inv => inv.expiresAt > now)

  return invitations.map(inv => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    createdAt: inv.createdAt,
    invitedBy: { name: inv.invitedByName }
  }))
})
