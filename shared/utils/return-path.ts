/**
 * Where to go after signing in: the page that sent you to the login form, if
 * it is a path on this site (handoff `05-interaktion.md` › Routing: "after
 * signing in, to the original destination").
 *
 * Only an absolute *path* is accepted. `//evil.example` and `/\evil.example`
 * are protocol-relative URLs to a browser — `navigateTo` would follow them off
 * the site — and anything with a scheme is not a path at all. That is the
 * whole open-redirect surface of a `redirect` query, and why the consent page
 * used to be the only address allowed through.
 */
export function safeReturnPath(value: unknown, fallback = '/projects'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  // A sign-in page as the destination would loop straight back to this form.
  if (/^\/(login|register|logout)(?:[/?#]|$)/.test(value)) return fallback
  return value
}
