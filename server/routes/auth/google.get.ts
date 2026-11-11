/**
 * Google sign-in. Completo links a sign-in to an account by email, so the address
 * must be one Google has verified: a Google account can be opened on any address
 * (not only Gmail), and until its owner confirms it, `email_verified` is false.
 * Gmail and Workspace addresses are always verified. See microsoft.get.ts for the
 * same rule where the provider makes it harder.
 */
export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    if (!user.email || user.email_verified !== true) {
      return sendRedirect(event, '/login?error=oauth-unverified')
    }
    await handleOAuthUser(event, {
      email: user.email,
      name: user.name,
      avatarUrl: user.picture,
      provider: 'google'
    })
  },
  onError(event) {
    return sendRedirect(event, '/login?error=oauth')
  }
})
