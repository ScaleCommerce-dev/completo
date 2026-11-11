/**
 * Shown whenever the domain allowlist blocks a sign-up — self-registration and OAuth alike.
 *
 * It points at the invitation path unconditionally, and that is deliberate: someone who was
 * invited from a non-allowlisted domain hits this same wall, but choosing the wording based
 * on whether an invitation exists for the address would turn the form into an enumeration
 * oracle for who has been invited. So everyone gets the hint, and it reveals nothing.
 */
export const DOMAIN_RESTRICTED_MESSAGE
  = 'Registration is restricted to approved email domains. If you were invited, open the link in your invitation email to finish signing up.'

/**
 * Shown when the sign-in provider does not vouch for the address: Microsoft without
 * `xms_edov`, Google with `email_verified` false, GitHub with no verified primary
 * address (see the handlers in `server/routes/auth/`). The user cannot always tell
 * why — for Microsoft it may be this instance's app registration — so the message
 * names the way in that always works.
 */
export const OAUTH_UNVERIFIED_MESSAGE
  = 'Your sign-in provider could not confirm your email address. Confirm it with the provider, sign in with your password instead, or ask your administrator.'
