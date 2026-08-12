/**
 * Which page routes the global auth middleware lets through.
 *
 * Kept out of the middleware itself so it can be unit-tested: the middleware body calls
 * `defineNuxtRouteMiddleware`/`useUserSession` and can't be imported from a plain test, and
 * the last two entries here were missing for long enough that password recovery was
 * unreachable in the browser — every emailed reset link redirected to /login and dropped
 * its token on the way.
 */
export const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/logout',
  '/auth/setup-account',
  '/auth/forgot-password',
  '/auth/reset-password'
]

/**
 * Public routes that stop making sense once a session exists, so a signed-in visitor is
 * sent to /projects instead.
 *
 * Deliberately *not* the whole list above:
 * - `/logout` has to run.
 * - `/auth/setup-account` and `/auth/reset-password` are one-shot emailed links, and the
 *   browser holding a stale session is exactly when someone needs them. Bouncing them would
 *   also discard the token in the query string.
 * - `/auth/forgot-password` stays reachable because it is the only way back for a signed-in
 *   user who has forgotten their password: `PUT /api/user/password` requires the current one.
 */
export const SIGNED_IN_REDIRECT_ROUTES = [
  '/login',
  '/register'
]
