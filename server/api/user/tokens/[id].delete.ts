import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  const token = db.select()
    .from(schema.apiTokens)
    .where(and(
      eq(schema.apiTokens.id, id),
      eq(schema.apiTokens.userId, session.user.id)
    ))
    .get()

  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  db.delete(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .run()

  return { success: true }
})
