import { and, eq, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { token, password } = await readBody<{ token: string, password: string }>(event)

  if (!token || !password) {
    throw createError({ statusCode: 400, message: 'Token and password are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })
  }

  // Validate token and look up user. Only a token minted by forgot-password qualifies —
  // an email-verification or account-setup token must not be redeemable for a password.
  const { user } = lookupVerificationToken(token, 'reset', 'reset link')
  ensureNotSuspended(user)

  if (user.passwordHash === '!invited') {
    throw createError({ statusCode: 400, message: 'Invalid or expired reset link' })
  }

  // Update password
  db.update(schema.users)
    .set({
      passwordHash: await hashPassword(password),
      lastSeenAt: new Date()
    })
    .where(eq(schema.users.id, user.id))
    .run()

  // Delete all verification tokens for this user
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, user.id))
    .run()

  // A reset is how someone takes their account back, so it must also take back what
  // a past holder of the password minted: API tokens and MCP grants never expire on
  // their own, and one created during a takeover outlived the reset that ended it.
  // That includes the tokens of the agents this person manages: whoever held the
  // account could create an agent, or mint a token for an existing one, and keep
  // acting in these projects after the reset. The agents themselves stay, with their
  // projects and history; their manager generates new tokens for the ones they know.
  db.delete(schema.apiTokens).where(eq(schema.apiTokens.userId, user.id)).run()
  db.delete(schema.oauthGrants).where(eq(schema.oauthGrants.userId, user.id)).run()
  const managedAgents = db.select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.kind, 'agent'), eq(schema.users.managedById, user.id)))
  const revokedAgentTokens = db.delete(schema.apiTokens)
    .where(inArray(schema.apiTokens.userId, managedAgents))
    .returning({ id: schema.apiTokens.id })
    .all().length

  // Every other sign-in ends, including one a past holder of the password still has
  // open; the person resetting is signed in fresh.
  await rotateSessions(event, user)

  return { ok: true, revokedAgentTokens }
})
