import { DOMAIN_RESTRICTED_MESSAGE, OAUTH_UNVERIFIED_MESSAGE } from '#shared/utils/auth-messages'

/**
 * Why a social sign-in sent you back, read off the `?error=` the OAuth callback
 * routes redirect with. Login and registration both offer the provider buttons,
 * so both show it; the mapping was written out twice, byte for byte.
 */
export function useOAuthError() {
  const route = useRoute()
  return computed(() => {
    switch (route.query.error) {
      case 'oauth': return 'Sign-in failed. Please try again.'
      case 'oauth-suspended': return 'Your account has been suspended.'
      case 'oauth-domain': return DOMAIN_RESTRICTED_MESSAGE
      case 'oauth-unverified': return OAUTH_UNVERIFIED_MESSAGE
      default: return ''
    }
  })
}
