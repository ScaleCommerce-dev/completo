import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const grant = db.select({ id: schema.oauthGrants.id }).from(schema.oauthGrants)
    .where(and(eq(schema.oauthGrants.id, id), eq(schema.oauthGrants.userId, session.user.id)))
    .get()
  if (!grant) throw createError({ statusCode: 404, message: 'Connection not found' })
  db.delete(schema.oauthGrants).where(eq(schema.oauthGrants.id, id)).run()
  return { success: true }
})
