import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    return sendRedirect(event, '/login?error=invalid-token')
  }

  const tokenRow = db.select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.token, token))
    .get()

  if (!tokenRow) {
    return sendRedirect(event, '/login?error=invalid-token')
  }

  if (tokenRow.expiresAt < new Date()) {
    // Store expired token in a short-lived httpOnly cookie for the resend flow
    // instead of exposing it in the URL (browser history, referrer headers, analytics)
    setCookie(event, 'expired-verification-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes — just long enough for the resend click
      path: '/'
    })
    return sendRedirect(event, '/login?error=token-expired')
  }

  // Mark user as verified
  db.update(schema.users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(schema.users.id, tokenRow.userId))
    .run()

  // Delete all verification tokens for this user
  db.delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, tokenRow.userId))
    .run()

  // Auto-sign in
  const user = db.select()
    .from(schema.users)
    .where(eq(schema.users.id, tokenRow.userId))
    .get()

  if (user) {
    await setAuthSession(event, user)
    return sendRedirect(event, '/projects')
  }

  return sendRedirect(event, '/login?verified=true')
})
