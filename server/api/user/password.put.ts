import { eq } from 'drizzle-orm'
import { passwordChangeSchema } from '#shared/schemas/auth'

export default defineEventHandler(async (event) => {
  const { user, authMethod } = await resolveAuth(event)
  if (user.kind === 'agent') {
    throw createError({ statusCode: 403, message: 'Agents have no password' })
  }
  const { currentPassword, newPassword } = await readBodyAs(event, passwordChangeSchema)

  const userRecord = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()
  if (!userRecord) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const valid = await verifyPassword(userRecord.passwordHash, currentPassword)
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Current password is incorrect' })
  }

  const newHash = await hashPassword(newPassword)
  db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, user.id)).run()

  // Changing a password is how someone locks out whoever else knew it, so what they
  // could have minted goes too, as on a reset: API tokens and MCP grants never expire
  // on their own, and one created by a past holder of the password outlived the change.
  // That includes the token making this request, if it is one, and the tokens of the
  // agents this person manages: a past holder could mint one for an agent and keep
  // acting in these projects (a leaked API token can too, since it may manage agents).
  const revokedTokens = db.delete(schema.apiTokens).where(eq(schema.apiTokens.userId, user.id)).returning({ id: schema.apiTokens.id }).all().length
  const revokedGrants = db.delete(schema.oauthGrants).where(eq(schema.oauthGrants.userId, user.id)).returning({ id: schema.oauthGrants.id }).all().length
  const revokedAgentTokens = revokeManagedAgentCredentials(user.id)

  // Every other sign-in ends. Over a cookie this request stays signed in with a fresh
  // session; over an API token there is no session to keep.
  if (authMethod === 'session') {
    await rotateSessions(event, userRecord)
  } else {
    endAllSessions(user.id)
  }

  return { ok: true, revokedTokens, revokedGrants, revokedAgentTokens }
})
