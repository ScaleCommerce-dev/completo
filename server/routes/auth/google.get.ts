export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
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
