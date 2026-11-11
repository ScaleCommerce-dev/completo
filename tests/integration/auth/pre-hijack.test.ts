import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createTestToken, type TestUser } from '../../setup/auth'
import { createTestProject, createInvitation } from '../../setup/fixtures'

/**
 * Registration pre-hijack: an attacker registers an address they do not own, the
 * owner clicks the genuine verification mail, and the attacker signs in with the
 * password they chose. Each test closes one step of that chain.
 */

async function register(email: string, password: string, name = 'Someone') {
  return await $fetch<{ user?: { id: string } }>('/auth/register', { method: 'POST', body: { name, email, password } })
}

async function verifyToken(userId: string) {
  return (await $fetch<{ token: string | null }>(`/api/_test/get-verification-token?userId=${userId}`)).token
}

async function login(email: string, password: string) {
  return await fetch(url('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
}

describe('registering an address someone else registered but never verified', () => {
  it('replaces the first password and kills the first link', async () => {
    const email = `prehijack-${Date.now()}@test.com`
    const first = await register(email, 'attacker-pass')
    const firstToken = await verifyToken(first.user!.id)

    const second = await register(email, 'owner-pass', 'Owner')
    expect(second.user?.id).toBe(first.user!.id)
    const secondToken = await verifyToken(second.user!.id)
    expect(secondToken).not.toBe(firstToken)

    // The first registration's link no longer verifies anything.
    const stale = await fetch(url(`/auth/verify-email?token=${firstToken}`), { redirect: 'manual' })
    expect(stale.headers.get('location')).toContain('invalid-token')

    const fresh = await fetch(url(`/auth/verify-email?token=${secondToken}`), { redirect: 'manual' })
    expect(fresh.headers.get('location')).toBe('/projects')

    expect((await login(email, 'attacker-pass')).status).toBe(401)
    expect((await login(email, 'owner-pass')).status).toBe(200)
  })

  it('still answers a verified address without touching it', async () => {
    const owner = await registerTestUser({ password: 'owner-pass' })
    const res = await register(owner.email, 'attacker-pass')
    expect(res.user).toBeUndefined()
    expect((await login(owner.email, 'owner-pass')).status).toBe(200)
    expect((await login(owner.email, 'attacker-pass')).status).toBe(401)
  })
})

describe('project invitations on an unverified registration', () => {
  let owner: TestUser
  let project: { id: string }

  beforeAll(async () => {
    owner = await registerTestUser()
    project = await createTestProject(owner)
  })

  it('are claimed at verification, not at registration', async () => {
    const email = `invitee-${Date.now()}@test.com`
    await createInvitation(owner, project.id, email)
    const reg = await register(email, 'whatever-pass')

    const before = await $fetch<Array<{ id: string }>>(`/api/projects/${project.id}/members`, { headers: owner.headers })
    expect(before.some(m => m.id === reg.user!.id)).toBe(false)

    const token = await verifyToken(reg.user!.id)
    await fetch(url(`/auth/verify-email?token=${token}`), { redirect: 'manual' })

    const after = await $fetch<Array<{ id: string }>>(`/api/projects/${project.id}/members`, { headers: owner.headers })
    expect(after.some(m => m.id === reg.user!.id)).toBe(true)
  })

  it('adding an unverified address by email invites rather than attaches', async () => {
    const email = `unverified-${Date.now()}@test.com`
    const reg = await register(email, 'whatever-pass')

    await createInvitation(owner, project.id, email)
    const invitation = await $fetch<{ projectId: string }>(`/api/_test/get-invitation?email=${encodeURIComponent(email)}`)
    expect(invitation.projectId).toBe(project.id)
    const members = await $fetch<Array<{ id: string }>>(`/api/projects/${project.id}/members`, { headers: owner.headers })
    expect(members.some(m => m.id === reg.user!.id)).toBe(false)
  })
})

describe('password reset', () => {
  it('revokes API tokens, which would otherwise outlive a takeover', async () => {
    const user = await registerTestUser()
    const token = await createTestToken(user)
    expect((await fetch(url('/api/projects'), { headers: token.headers })).status).toBe(200)

    await $fetch('/auth/forgot-password', { method: 'POST', body: { email: user.email } })
    const reset = await $fetch<{ token: string | null, purpose: string | null }>(`/api/_test/get-verification-token?userId=${user.id}`)
    expect(reset.purpose).toBe('reset')
    await $fetch('/auth/reset-password', { method: 'POST', body: { token: reset.token, password: 'brand-new-pass' } })

    expect((await fetch(url('/api/projects'), { headers: token.headers })).status).toBe(401)
  })
})
