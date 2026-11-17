import { eq } from 'drizzle-orm'
import { resetPasswordSchema } from '#shared/schemas/auth'

export default defineEventHandler(async (event) => {
  const { token, password } = await readBodyAs(event, resetPasswordSchema)

  // Validate token and look up user. Only a token minted by forgot-password qualifies —
  // an email-verification or account-setup token must not be redeemable for a password.
  const { user } = lookupVerificationToken(token, 'reset', 'reset link')
  ensureNotSuspended(user)

  if (user.passwordHash === '!invited') {
    throw createError({ statusCode: 400, message: 'Invalid or expired reset link' })
  }

  const passwordHash = await hashPassword(password)

  // One transaction, so the link is spent exactly when the password changes and the
  // old credentials go with it: a failure part-way through could otherwise leave the
  // new password set with the link still valid and the old tokens still live.
  const { revokedAgentTokens } = db.transaction(() => {
    db.update(schema.users)
      .set({ passwordHash, lastSeenAt: new Date() })
      .where(eq(schema.users.id, user.id))
      .run()

    // Delete all verification tokens for this user
    db.delete(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.userId, user.id))
      .run()

    // A reset is how someone takes their account back, so it must also take back what
    // a past holder of the password minted: API tokens, MCP grants and unexchanged
    // authorization codes never lapse with the password, and one created during a
    // takeover outlived the reset that ended it. That includes the tokens of the
    // agents this person manages: whoever held the account could create an agent, or
    // mint a token for an existing one, and keep acting in these projects after the
    // reset. The agents themselves stay, with their projects and history; their
    // manager generates new tokens for the ones they know.
    return revokeAccountCredentials(user.id)
  })

  // Every other sign-in ends, including one a past holder of the password still has
  // open; the person resetting is signed in fresh.
  await rotateSessions(event, user)

  return { ok: true, revokedAgentTokens }
})
