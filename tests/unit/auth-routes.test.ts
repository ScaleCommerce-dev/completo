import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PUBLIC_ROUTES, SIGNED_IN_REDIRECT_ROUTES } from '../../shared/utils/auth-routes'

/**
 * `auth.global.ts` can't be imported here — it calls `defineNuxtRouteMiddleware` — so these
 * guard the lists it reads instead. The bug they exist for: `/auth/forgot-password` and
 * `/auth/reset-password` were added as pages but never as public routes, so with `ssr: false`
 * the middleware bounced anonymous visitors to /login and threw away the reset token in the
 * query string. Password recovery was unreachable in the browser while every server-side test
 * of the same flow passed.
 */
describe('auth route lists', () => {
  it('exposes every page under app/pages/auth as a public route', () => {
    // The invariant that would have caught it: anything in that directory is by definition a
    // pre-login flow, so adding a page there and forgetting this list is the mistake to fail on.
    const pages = readdirSync(resolve(import.meta.dirname, '../../app/pages/auth'))
      .filter(f => f.endsWith('.vue'))
      .map(f => `/auth/${f.replace(/\.vue$/, '')}`)

    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(PUBLIC_ROUTES).toContain(page)
    }
  })

  it('keeps the recovery pages reachable without a session', () => {
    expect(PUBLIC_ROUTES).toContain('/auth/forgot-password')
    expect(PUBLIC_ROUTES).toContain('/auth/reset-password')
  })

  it('does not bounce a signed-in visitor off a one-shot emailed link', () => {
    // Redirecting these would discard the token in the query string, and forgot-password is
    // the only route back for someone signed in who has forgotten their password, since
    // PUT /api/user/password demands the current one.
    for (const route of ['/auth/reset-password', '/auth/setup-account', '/auth/forgot-password']) {
      expect(SIGNED_IN_REDIRECT_ROUTES).not.toContain(route)
    }
  })

  it('never redirects /logout, which has to run', () => {
    expect(PUBLIC_ROUTES).toContain('/logout')
    expect(SIGNED_IN_REDIRECT_ROUTES).not.toContain('/logout')
  })

  it('only redirects routes that are public to begin with', () => {
    for (const route of SIGNED_IN_REDIRECT_ROUTES) {
      expect(PUBLIC_ROUTES).toContain(route)
    }
  })
})
