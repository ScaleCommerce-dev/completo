import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)

  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ suspended?: boolean, isAdmin?: boolean }>(event)

  if (id === user.id) {
    throw createError({ statusCode: 400, message: 'Cannot modify yourself' })
  }

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, id)).get()
  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const updates: Record<string, Date | number | null> = {}

  if (typeof body.suspended === 'boolean') {
    updates.suspendedAt = body.suspended ? new Date() : null
  }

  if (typeof body.isAdmin === 'boolean') {
    updates.isAdmin = body.isAdmin ? 1 : 0
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No valid fields to update' })
  }

  db.update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, id))
    .run()

  return { ok: true }
})
