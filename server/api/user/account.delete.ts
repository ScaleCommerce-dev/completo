import { eq, and, sql } from 'drizzle-orm'
import { accountDeleteSchema } from '#shared/schemas/auth'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  if (user.kind === 'agent') {
    throw createError({ statusCode: 403, message: 'An agent is deleted by its manager' })
  }
  const { password } = await readBodyAs(event, accountDeleteSchema)

  if (user.isAdmin) {
    throw createError({ statusCode: 403, message: 'Admin accounts cannot be self-deleted' })
  }

  const userRecord = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()
  if (!userRecord) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  checkCurrentPasswordAttempt(event, user.id)
  const valid = await verifyPassword(userRecord.passwordHash, password)
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Password is incorrect' })
  }

  // Projects only this person owns would be left with nobody who can manage members,
  // statuses or settings, and one where they are the only member with nobody at all:
  // only an admin could reach it. Refused, naming them, so they hand each one over
  // or delete it first, as removing or demoting the last owner is refused.
  const stranded = db.select({ name: schema.projects.name })
    .from(schema.projectMembers)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectMembers.projectId))
    .where(and(
      eq(schema.projectMembers.userId, user.id),
      eq(schema.projectMembers.role, 'owner'),
      sql`(select count(*) from project_members o where o.project_id = ${schema.projectMembers.projectId} and o.role = 'owner') = 1`
    ))
    .all()
  if (stranded.length) {
    const names = stranded.map(p => `"${p.name}"`).join(', ')
    throw createError({
      statusCode: 409,
      message: `You are the only owner of ${names}. Make another member an owner, or delete ${stranded.length === 1 ? 'it' : 'them'}, before deleting your account.`
    })
  }

  // Someone leaving cannot hand their agents to anyone, so instead of refusing as
  // an admin's delete does, suspend them: their tokens die now, and once this row
  // is gone they show as having no manager until an admin transfers them.
  suspendAgents(activeAgentsOf(user.id).map(a => a.id))

  db.transaction(() => {
    recordAccountRemoval(user, user)
    db.delete(schema.users).where(eq(schema.users.id, user.id)).run()
  })
  await clearUserSession(event)

  return { ok: true }
})
