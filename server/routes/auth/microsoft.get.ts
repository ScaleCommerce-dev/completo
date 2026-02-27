export default defineOAuthMicrosoftEventHandler({
  config: {
    tenant: 'common'
  },
  async onSuccess(event, { user }) {
    await handleOAuthUser(event, {
      email: user.mail || user.userPrincipalName,
      name: user.displayName,
      avatarUrl: null,
      provider: 'microsoft'
    })
  },
  onError(event) {
    return sendRedirect(event, '/login?error=oauth')
  }
})
