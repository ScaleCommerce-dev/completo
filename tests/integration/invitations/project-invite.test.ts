import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('Project invitations', () => {
  let owner: TestUser
  let admin: TestUser
  let project: any

  beforeAll(async () => {
    owner = await registerTestUser()
    admin = await createAdminUser()
    project = await createTestProject(owner)
  })

  describe('invite existing user', () => {
    let existingUser: TestUser

    beforeAll(async () => {
      existingUser = await registerTestUser()
    })

    it('owner can add existing user by email — returns uniform response', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: existingUser.email })
      })

      expect(res.status).toBe(201)
      const result = await res.json()
      // Uniform response shape — no user existence leak
      expect(result.added).toBe(true)
    })

    it('adding already-a-member returns 409', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: existingUser.email })
      })
      expect(res.status).toBe(409)
    })
  })

  describe('invite non-existing user', () => {
    const inviteEmail = `invite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`

    it('returns uniform response for unknown email', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      })
      expect(res.status).toBe(201)
      const result = await res.json()
      // Same shape as adding existing user — no user existence leak
      expect(result.added).toBe(true)
    })

    it('duplicate invitation returns 409', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      })
      expect(res.status).toBe(409)
    })

    it('pending invitation appears in GET list', async () => {
      const invitations = await $fetch(`/api/projects/${project.id}/invitations`, {
        headers: owner.headers
      }) as any[]

      const found = invitations.find(i => i.email === inviteEmail.toLowerCase())
      expect(found).toBeDefined()
      expect(found.invitedBy).toBeDefined()
      expect(found.invitedBy.name).toBe(owner.name)
    })

    it('public invitation info endpoint returns project + inviter', async () => {
      const inv = await $fetch(`/api/_test/get-invitation`, {
        params: { email: inviteEmail }
      }) as any

      const info = await $fetch(`/api/invitations/${inv.token}`) as any
      expect(info.email).toBe(inviteEmail.toLowerCase())
      expect(info.projectName).toBe(project.name)
      expect(info.inviterName).toBe(owner.name)
    })

    it('owner can cancel invitation', async () => {
      // Create a new invitation to cancel
      const cancelEmail = `cancel-${Date.now()}@example.com`
      await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cancelEmail })
      })

      const invitations = await $fetch(`/api/projects/${project.id}/invitations`, {
        headers: owner.headers
      }) as any[]
      const inv = invitations.find(i => i.email === cancelEmail.toLowerCase())
      expect(inv).toBeDefined()

      const result = await $fetch(`/api/projects/${project.id}/invitations/${inv.id}`, {
        method: 'DELETE',
        headers: owner.headers
      }) as any
      expect(result.ok).toBe(true)

      // Should be gone
      const after = await $fetch(`/api/projects/${project.id}/invitations`, {
        headers: owner.headers
      }) as any[]
      expect(after.find(i => i.email === cancelEmail.toLowerCase())).toBeUndefined()
    })
  })

  describe('registration with invitation', () => {
    it('invited user is auto-added to project on registration', async () => {
      const regEmail = `reg-invite-${Date.now()}@example.com`

      // Invite this email
      await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail })
      })

      // Get the invitation token
      const inv = await $fetch(`/api/_test/get-invitation`, {
        params: { email: regEmail }
      }) as any

      // Register with invitation token
      const regRes = await fetch(url('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invited User',
          email: regEmail,
          password: 'testpass123',
          invitation: inv.token
        })
      })
      expect(regRes.status).toBe(200)
      const regBody = await regRes.json() as any

      // Verify email
      await $fetch('/api/_test/verify-email', {
        method: 'POST',
        body: { userId: regBody.user.id }
      })

      // Login
      const loginRes = await fetch(url('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, password: 'testpass123' })
      })
      expect(loginRes.status).toBe(200)
      const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]

      // Check membership
      const members = await $fetch(`/api/projects/${project.id}/members`, {
        headers: { cookie }
      }) as any[]

      const found = members.find(m => m.id === regBody.user.id)
      expect(found).toBeDefined()
      expect(found.role).toBe('member')
    })
  })

  describe('domain allowlist bypass', () => {
    it('invitation bypasses domain allowlist for registration', async () => {
      // Create a fresh project + owner for this test
      const domainOwner = await registerTestUser()
      const domainProject = await createTestProject(domainOwner)

      // Set domain allowlist via admin
      await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: ['onlyallowed.com'] },
        headers: admin.headers
      })

      // Self-registration should fail with restricted domain
      const selfRegEmail = `self-${Date.now()}@notallowed.com`
      const selfRes = await fetch(url('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Self Reg', email: selfRegEmail, password: 'testpass123' })
      })
      expect(selfRes.status).toBe(400)

      // Invite an email from the restricted domain
      const invitedEmail = `invited-${Date.now()}@notallowed.com`
      const inviteRes = await fetch(url(`/api/projects/${domainProject.id}/members`), {
        method: 'POST',
        headers: { ...domainOwner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invitedEmail })
      })
      expect(inviteRes.status).toBe(201)

      // Get invitation token
      const inv = await $fetch(`/api/_test/get-invitation`, {
        params: { email: invitedEmail }
      }) as any

      // Register with invitation — should bypass domain check
      const regRes = await fetch(url('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invited Domain User',
          email: invitedEmail,
          password: 'testpass123',
          invitation: inv.token
        })
      })
      expect(regRes.status).toBe(200)

      // Clean up: reset domain allowlist
      await $fetch('/api/admin/settings', {
        method: 'PUT',
        body: { allowedEmailDomains: [] },
        headers: admin.headers
      })
    })
  })

  describe('validation', () => {
    it('rejects invalid email format', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...owner.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' })
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for invalid invitation token on public endpoint', async () => {
      const res = await fetch(url('/api/invitations/invalid-token-123'))
      expect(res.status).toBe(404)
    })

    it('non-owner cannot list invitations', async () => {
      const member = await registerTestUser()
      // Add as member first
      await $fetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        body: { userId: member.id },
        headers: owner.headers
      })

      const res = await fetch(url(`/api/projects/${project.id}/invitations`), {
        headers: member.headers
      })
      expect(res.status).toBe(403)
    })
  })
})
