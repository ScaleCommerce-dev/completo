import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const tokens = db.select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, session.user.id))
    .orderBy(desc(schema.apiTokens.createdAt))
    .all()

  return tokens.map(t => ({
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    expiresAt: t.expiresAt,
    lastUsedAt: t.lastUsedAt,
    createdAt: t.createdAt,
    isExpired: t.expiresAt ? t.expiresAt < new Date() : false
  }))
})
