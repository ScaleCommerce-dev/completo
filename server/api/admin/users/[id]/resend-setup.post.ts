import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: admin } = await requireAdmin(event)
  const userId = getRouterParam(event, 'id')!

  const targetUser = db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get()

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  if (!isPendingSetup(targetUser)) {
    throw createError({ statusCode: 400, message: 'User has already completed setup' })
  }

  await sendAccountSetupLink(targetUser, admin.name)

  return { ok: true }
})
