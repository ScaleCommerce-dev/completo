import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event)

  const members = db.select()
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(eq(schema.projectMembers.projectId, project.id))
    .all()

  return members.map(m => ({
    id: m.users.id,
    email: m.users.email,
    name: m.users.name,
    avatarUrl: m.users.avatarUrl,
    role: m.project_members.role
  }))
})
