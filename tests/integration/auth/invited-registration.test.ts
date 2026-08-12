import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { createAdminUser, registerTestUser, type TestUser } from '../../setup/auth'

/**
 * Covers what happens when someone who was already invited signs up through the normal
 * register form instead of following their emailed link, plus the email normalisation that
 * made the two paths disagree about who is who.
 */

async function setupToken(userId: string): Promise<string | null> {
  const res = await $fetch(`/api/_test/get-verification-token?userId=${userId}`) as { token: string | null }
  return res.token
}

async function registerRaw(body: Record<string, unknown>): Promise<Response> {
  return await fetch(url('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('registering when already invited', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
  })

  async function createPendingUser(email: string) {
    return await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: 'Invited Person', email },
      headers: admin.headers
    }) as { id: string, email: string }
  }

  it('re-sends the setup link rather than silently doing nothing', async () => {
    // The whole point: this used to return "check your email" and write nothing, so an
    // admin-created user who registered instead of using their link was stranded — no
    // password, no email, no signal to them or the admin.
    const email = `invited-reg-${Date.now()}@example.com`
    const created = await createPendingUser(email)
    const firstToken = await setupToken(created.id)
    expect(firstToken).toBeTruthy()

    const res = await registerRaw({ name: 'Invited Person', email, password: 'chosenpass123' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>

    // Byte-identical to the anti-enumeration bail for any taken address: no `user` key,
    // nothing that confirms the account exists.
    expect(body.requiresVerification).toBe(true)
    expect(body.message).toBe('Account created. Please check your email to verify your account.')
    expect(body).not.toHaveProperty('user')

    const secondToken = await setupToken(created.id)
    expect(secondToken).toBeTruthy()
    expect(secondToken).not.toBe(firstToken)
  })

  it('does not hand out an account — the password typed at registration still will not work', async () => {
    const email = `invited-nologin-${Date.now()}@example.com`
    await createPendingUser(email)
    await registerRaw({ name: 'Invited Person', email, password: 'chosenpass123' })

    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'chosenpass123' })
    })
    expect(res.status).toBe(401)
  })

  it('issues nothing for an account that already completed setup', async () => {
    // Asserting "unchanged" rather than "null": registerTestUser leaves its own verification
    // token behind, and either way no *new* link may be issued for a claimed account.
    const user = await registerTestUser()
    const before = await setupToken(user.id)

    await registerRaw({ name: user.name, email: user.email, password: 'different123' })

    expect(await setupToken(user.id)).toBe(before)
  })
})

describe('email normalisation', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
  })

  it('stores the address lowercased', async () => {
    const email = `MixedCase-${Date.now()}@Example.com`
    const res = await registerRaw({ name: 'Mixed Case', email, password: 'testpass123' })
    const body = await res.json() as { user: { email: string } }
    expect(body.user.email).toBe(email.toLowerCase())
  })

  it('accepts any capitalisation at login', async () => {
    const email = `case-login-${Date.now()}@example.com`
    const res = await registerRaw({ name: 'Case Login', email, password: 'testpass123' })
    const { user } = await res.json() as { user: { id: string } }
    await $fetch('/api/_test/verify-email', { method: 'POST', body: { userId: user.id } })

    const login = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toUpperCase(), password: 'testpass123' })
    })
    expect(login.status).toBe(200)
  })

  it('does not create a second account for a different capitalisation', async () => {
    // This is what produced the "pending setup" ghosts: `users.email` is UNIQUE but not
    // COLLATE NOCASE, so `Foo@x` slipped past the duplicate check on `foo@x`.
    const email = `dupe-${Date.now()}@example.com`
    await registerRaw({ name: 'First', email, password: 'testpass123' })

    const res = await registerRaw({ name: 'Second', email: email.toUpperCase(), password: 'other12345' })
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('user')

    const users = await $fetch('/api/admin/users', { headers: admin.headers }) as Array<{ email: string }>
    expect(users.filter(u => u.email.toLowerCase() === email.toLowerCase())).toHaveLength(1)
  })

  it('trims surrounding whitespace', async () => {
    const email = `trimmed-${Date.now()}@example.com`
    const res = await registerRaw({ name: 'Trimmed', email: `  ${email}  `, password: 'testpass123' })
    const body = await res.json() as { user: { email: string } }
    expect(body.user.email).toBe(email)
  })
})

describe('domain allowlist message', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
  })

  afterAll(async () => {
    await $fetch('/api/admin/settings', {
      method: 'PUT',
      body: { allowedEmailDomains: [] },
      headers: admin.headers
    })
  })

  it('points a blocked sign-up at their invitation email', async () => {
    // An invited user from a non-allowlisted domain hits this same wall, and the message
    // cannot depend on whether an invitation exists without leaking who has been invited.
    await $fetch('/api/admin/settings', {
      method: 'PUT',
      body: { allowedEmailDomains: ['allowed-only.test'] },
      headers: admin.headers
    })

    const res = await registerRaw({
      name: 'Blocked',
      email: `blocked-${Date.now()}@notallowed.test`,
      password: 'testpass123'
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { message: string }
    expect(body.message).toContain('invitation email')
  })
})
