/**
 * GitHub sign-in. Completo links a sign-in to an account by email, so the address
 * must be one GitHub has verified. nuxt-auth-utils takes the profile's public
 * email as-is when there is one — GitHub's settings page only offers verified
 * addresses there, but the API promises nothing — and falls back to the primary
 * address without requiring it to be verified. So ask GitHub directly: the
 * `user:email` scope (added by `emailRequired`) lists every address with its
 * `verified` flag, and only the primary, verified one is used.
 */
interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
}

export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true
  },
  async onSuccess(event, { user, tokens }) {
    const emails = await $fetch<GitHubEmail[]>('https://api.github.com/user/emails', {
      headers: {
        'User-Agent': 'Completo',
        'Authorization': `token ${tokens.access_token}`
      }
    }).catch(() => [] as GitHubEmail[])
    const primary = emails.find(e => e.primary && e.verified)
    if (!primary) {
      return sendRedirect(event, '/login?error=oauth-unverified')
    }
    await handleOAuthUser(event, {
      email: primary.email,
      name: user.name || user.login,
      avatarUrl: user.avatar_url,
      provider: 'github'
    })
  },
  onError(event) {
    return sendRedirect(event, '/login?error=oauth')
  }
})
