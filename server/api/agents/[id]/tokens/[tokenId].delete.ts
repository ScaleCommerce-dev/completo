import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { agent } = await resolveManagedAgent(event)
  const tokenId = getRouterParam(event, 'tokenId')!

  const token = db.select({ id: schema.apiTokens.id })
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, agent.id)))
    .get()

  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  db.delete(schema.apiTokens).where(eq(schema.apiTokens.id, token.id)).run()
  return { success: true }
})
