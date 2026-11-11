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
 * Shown when Microsoft sign-in cannot vouch for the address (no `xms_edov`, see
 * `server/routes/auth/microsoft.get.ts`). Either the organisation has not verified
 * the email's domain, or this instance's app registration lacks the optional claim;
 * the user cannot tell which, so the message names the way in that always works.
 */
export const OAUTH_UNVERIFIED_MESSAGE
  = 'Microsoft could not confirm your email address. Sign in with your password instead, or ask your administrator.'
