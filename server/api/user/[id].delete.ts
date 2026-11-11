import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)

  const id = getRouterParam(event, 'id')!

  if (id === user.id) {
    throw createError({ statusCode: 400, message: 'Cannot delete yourself' })
  }

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, id)).get()
  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  if (targetUser.kind === 'agent') {
    throw createError({ statusCode: 400, message: 'Agents are deleted under /api/agents' })
  }

  // Their active agents need a new manager, or suspending, before they go.
  assertNoActiveAgents(targetUser)

  db.transaction(() => {
    recordAccountRemoval(targetUser, user)
    db.delete(schema.users).where(eq(schema.users.id, id)).run()
  })
  return { ok: true }
})
