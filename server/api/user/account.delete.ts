import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  if (user.kind === 'agent') {
    throw createError({ statusCode: 403, message: 'An agent is deleted by its manager' })
  }
  const { password } = await readBody<{ password: string }>(event)

  if (!password) {
    throw createError({ statusCode: 400, message: 'Password is required' })
  }

  if (user.isAdmin) {
    throw createError({ statusCode: 403, message: 'Admin accounts cannot be self-deleted' })
  }

  const userRecord = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()
  if (!userRecord) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const valid = await verifyPassword(userRecord.passwordHash, password)
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Password is incorrect' })
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
