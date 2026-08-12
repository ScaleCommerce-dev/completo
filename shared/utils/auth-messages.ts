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
