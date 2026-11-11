/**
 * Microsoft (Entra ID) sign-in, open to any organisation's tenant.
 *
 * Completo links an OAuth sign-in to an account by email, so the address must be
 * one Microsoft vouches for. Graph's `mail` and the token's `email` claim are not
 * that: any tenant's administrator can set them to any value, and anyone can
 * create a tenant. This handler used to read `mail`, so a user in a throwaway
 * tenant with `mail = admin@victim.example` was signed in as that admin.
 *
 * What Microsoft does vouch for is `xms_edov` ("email domain owner verified"):
 * true when the user's tenant has proven it owns the domain of the `email`
 * claim. An attacker can create a tenant, but cannot verify someone else's
 * domain in it. It is an *optional* claim, so the app registration must add it
 * (Token configuration → Add optional claim → ID → `xms_edov`, plus `email`);
 * without it every sign-in is refused with `oauth-unverified`, which fails
 * closed rather than falling back to the unverified address.
 *
 * The ID token arrives directly from Microsoft's token endpoint over TLS in the
 * code exchange, so per OIDC Core 3.1.3.7 its signature need not be re-checked.
 */
interface MicrosoftIdClaims {
  email?: string
  xms_edov?: boolean | string
  name?: string
}

function idTokenClaims(idToken: unknown): MicrosoftIdClaims | null {
  if (typeof idToken !== 'string') return null
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export default defineOAuthMicrosoftEventHandler({
  config: {
    // From NUXT_OAUTH_MICROSOFT_TENANT when set. This used to be hardcoded, and
    // the handler's config wins over runtime config, so the env var did nothing.
    tenant: useRuntimeConfig().oauth?.microsoft?.tenant || 'common',
    // `openid` makes the token endpoint return an ID token, which is where
    // `email` and `xms_edov` are; `User.Read` is for the Graph profile.
    scope: ['openid', 'email', 'profile', 'User.Read']
  },
  async onSuccess(event, { user, tokens }) {
    const claims = idTokenClaims(tokens.id_token)
    const verified = claims?.xms_edov === true || claims?.xms_edov === 'true' || claims?.xms_edov === '1'
    if (!claims?.email || !verified) {
      return sendRedirect(event, '/login?error=oauth-unverified')
    }
    await handleOAuthUser(event, {
      email: claims.email,
      name: user.displayName || claims.name || claims.email,
      avatarUrl: null,
      provider: 'microsoft'
    })
  },
  onError(event) {
    return sendRedirect(event, '/login?error=oauth')
  }
})
