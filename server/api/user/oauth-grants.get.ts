import { eq, desc } from 'drizzle-orm'

/** The apps signed in to this account through OAuth, newest first. No hashes leave. */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  return db.select({
    id: schema.oauthGrants.id,
    clientName: schema.oauthGrants.clientName,
    createdAt: schema.oauthGrants.createdAt,
    lastUsedAt: schema.oauthGrants.lastUsedAt,
    refreshExpiresAt: schema.oauthGrants.refreshExpiresAt
  })
    .from(schema.oauthGrants)
    .where(eq(schema.oauthGrants.userId, session.user.id))
    .orderBy(desc(schema.oauthGrants.createdAt))
    .all()
})
