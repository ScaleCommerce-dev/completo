import { eq } from 'drizzle-orm'

/**
 * Issue a fresh 24h setup token for an admin-created account and email the link.
 *
 * Shared by the admin's "resend setup" action and by `/auth/register`, where someone who
 * was invited tries to sign up instead of using their link. That second caller is why this
 * never signals anything back: register must return an identical response whether or not
 * the address exists, so a failure to send is logged, not thrown.
 */
export async function sendAccountSetupLink(
  user: { id: string, email: string },
  inviterName: string
): Promise<void> {
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, user.id))
    .run()

  const token = crypto.randomUUID()
  db.insert(schema.emailVerificationTokens).values({
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  }).run()

  if (!isEmailEnabled()) return

  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  try {
    await sendAccountSetupEmail(user.email, inviterName, `${baseUrl}/auth/setup-account?token=${token}`)
  } catch (err) {
    console.error('Failed to send account setup email:', (err as Error).message)
  }
}

/** True for an admin-created account that has not yet been claimed. */
export function isPendingSetup(user: { passwordHash: string, emailVerifiedAt: Date | null }): boolean {
  return user.passwordHash === '!invited' && user.emailVerifiedAt === null
}
