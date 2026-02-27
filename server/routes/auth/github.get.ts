export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true
  },
  async onSuccess(event, { user }) {
    await handleOAuthUser(event, {
      email: user.email!,
      name: user.name || user.login,
      avatarUrl: user.avatar_url,
      provider: 'github'
    })
  },
  onError(event) {
    return sendRedirect(event, '/login?error=oauth')
  }
})
