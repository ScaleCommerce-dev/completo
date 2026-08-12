import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { createAdminUser, registerTestUser, type TestUser } from '../../setup/auth'

/**
 * Every email flow writes to `email_verification_tokens`. Until `purpose` existed, each
 * consumer accepted any live row there, so a token minted to confirm an address could be
 * redeemed for a password instead — and both /auth/reset-password and /auth/verify-email sign
 * the caller in, so one intercepted or forwarded message was a full account takeover.
 *
 * These tests pin each token to its own flow, from both directions: the wrong token is
 * refused, and the right one still works.
 */

interface TokenInfo { token: string | null, purpose: string | null }

async function tokenFor(userId: string): Promise<TokenInfo> {
  return await $fetch(`/api/_test/get-verification-token?userId=${userId}`) as TokenInfo
}

async function post(path: string, body: unknown): Promise<Response> {
  return await fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

/**
 * Whether a response signed the caller in.
 *
 * Not simply "did it Set-Cookie": h3 seals and sets an *empty* session on the way out of
 * essentially every request, so the header is present even on a rejection. What matters is
 * whether the cookie it hands back carries a user — the auto-sign-in on these endpoints is the
 * reason a redeemed token was worth stealing.
 */
async function signsCallerIn(res: Response): Promise<boolean> {
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) return false

  const session = await fetch(url('/api/_auth/session'), { headers: { cookie } })
  if (!session.ok) return false

  const body = await session.json().catch(() => ({})) as { user?: unknown }
  return Boolean(body.user)
}

/** An unverified account that still holds the verify token register issued. */
async function userWithVerifyToken() {
  const email = `purpose-verify-${Date.now()}-${Math.round(performance.now())}@example.com`
  const password = 'originalPass123'
  const body = await $fetch('/auth/register', {
    method: 'POST',
    body: { name: 'Verify Purpose', email, password }
  }) as { user: { id: string } }
  return { id: body.user.id, email, password, ...await tokenFor(body.user.id) }
}

/** A verified account that asked for a password reset. */
async function userWithResetToken() {
  const user = await registerTestUser()
  await $fetch('/auth/forgot-password', { method: 'POST', body: { email: user.email } })
  return { ...user, ...await tokenFor(user.id) }
}

describe('email token purposes', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
  })

  /** An admin-created account that has never been claimed. */
  async function userWithSetupToken() {
    const email = `purpose-setup-${Date.now()}-${Math.round(performance.now())}@example.com`
    const created = await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Setup Purpose', email },
      headers: admin.headers
    }) as { id: string }
    return { id: created.id, email, ...await tokenFor(created.id) }
  }

  it('labels each flow\'s token with its own purpose', async () => {
    expect((await userWithVerifyToken()).purpose).toBe('verify')
    expect((await userWithResetToken()).purpose).toBe('reset')
    expect((await userWithSetupToken()).purpose).toBe('setup')
  })

  describe('a verification token is not a password reset', () => {
    it('is refused by /auth/reset-password, leaving the password intact', async () => {
      // The original takeover: register as anyone, take the "confirm your address" token out
      // of their inbox, POST it here with a password of your choosing, and the response also
      // handed back a working session.
      const victim = await userWithVerifyToken()

      const res = await post('/auth/reset-password', {
        token: victim.token,
        password: 'attackerChosen1'
      })

      expect(res.status).toBe(400)
      expect(await signsCallerIn(res)).toBe(false)

      // The account is untouched: still unverified, and still holding its own token.
      const after = await tokenFor(victim.id)
      expect(after.token).toBe(victim.token)
      expect(after.purpose).toBe('verify')

      // And the attacker's password was never installed. Verify first so the 401 can only be
      // about credentials, not the unverified-email gate.
      await $fetch('/api/_test/verify-email', { method: 'POST', body: { userId: victim.id } })
      const attacker = await post('/auth/login', { email: victim.email, password: 'attackerChosen1' })
      expect(attacker.status).toBe(401)
      const owner = await post('/auth/login', { email: victim.email, password: victim.password })
      expect(owner.status).toBe(200)
    })

    it('is refused by /auth/setup-account', async () => {
      const victim = await userWithVerifyToken()

      const res = await post('/auth/setup-account', {
        token: victim.token,
        password: 'attackerChosen1',
        name: 'Renamed By Attacker'
      })

      expect(res.status).toBe(400)
      expect(await signsCallerIn(res)).toBe(false)
    })
  })

  describe('a reset token is only a password reset', () => {
    it('is refused by /auth/verify-email', async () => {
      const user = await userWithResetToken()

      const res = await fetch(url(`/auth/verify-email?token=${user.token}`), { redirect: 'manual' })

      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain('/login?error=invalid-token')
    })

    it('is refused by /auth/setup-account', async () => {
      const user = await userWithResetToken()

      const res = await post('/auth/setup-account', {
        token: user.token,
        password: 'attackerChosen1',
        name: 'Renamed By Attacker'
      })

      expect(res.status).toBe(400)
    })

    it('still resets the password it was issued for', async () => {
      const user = await userWithResetToken()

      const res = await post('/auth/reset-password', { token: user.token, password: 'chosenByOwner1' })
      expect(res.status).toBe(200)

      const login = await post('/auth/login', { email: user.email, password: 'chosenByOwner1' })
      expect(login.status).toBe(200)
    })
  })

  describe('a setup token is only an account claim', () => {
    it('is refused by /auth/reset-password', async () => {
      const invited = await userWithSetupToken()

      const res = await post('/auth/reset-password', { token: invited.token, password: 'attackerChosen1' })

      expect(res.status).toBe(400)
    })

    it('is refused by /auth/verify-email — that would grant a session with no password set', async () => {
      const invited = await userWithSetupToken()

      const res = await fetch(url(`/auth/verify-email?token=${invited.token}`), { redirect: 'manual' })

      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain('/login?error=invalid-token')
    })

    it('still claims the account it was issued for', async () => {
      const invited = await userWithSetupToken()

      const res = await post('/auth/setup-account', {
        token: invited.token,
        password: 'chosenByOwner1',
        name: 'Claimed Properly'
      })
      expect(res.status).toBe(200)

      const login = await post('/auth/login', { email: invited.email, password: 'chosenByOwner1' })
      expect(login.status).toBe(200)
    })

    it('will not re-claim an account that is no longer pending', async () => {
      // Mirrors a setup link that arrives after the account is already in use. The token is
      // valid and correctly scoped, so only the isPendingSetup guard stops it rewriting a live
      // user's password and display name — and signing the caller in as them.
      const invited = await userWithSetupToken()
      await $fetch('/api/_test/verify-email', { method: 'POST', body: { userId: invited.id } })

      const res = await post('/auth/setup-account', {
        token: invited.token,
        password: 'attackerChosen1',
        name: 'Renamed By Attacker'
      })

      expect(res.status).toBe(400)
      expect(await signsCallerIn(res)).toBe(false)
    })
  })
})
