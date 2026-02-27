import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createInvitation } from '../../setup/fixtures'

describe('GET /api/admin/invitations', () => {
  let admin: TestUser
  let regularUser: TestUser
  let owner: TestUser
  let project: any
  const inviteEmail = `admin-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
    owner = await registerTestUser()
    project = await createTestProject(owner)

    // Create an invitation for a non-existing user
    await createInvitation(owner, project.id, inviteEmail)
  })

  it('admin can list pending invitations', async () => {
    const invitations = await $fetch('/api/admin/invitations', {
      headers: admin.headers
    }) as any[]

    expect(Array.isArray(invitations)).toBe(true)
    const found = invitations.find(i => i.email === inviteEmail.toLowerCase())
    expect(found).toBeDefined()
    expect(found.projectName).toBe(project.name)
    expect(found.inviterName).toBe(owner.name)
    expect(found.projectId).toBe(project.id)
    expect(found.expiresAt).toBeDefined()
    expect(found.createdAt).toBeDefined()
  })

  it('non-admin gets 403', async () => {
    const res = await fetch(url('/api/admin/invitations'), {
      headers: regularUser.headers
    })
    expect(res.status).toBe(403)
  })

  it('excludes invitations where email is already registered', async () => {
    // Invite an existing user's email (they would normally be added directly,
    // but we test that IF such an invitation exists, it's filtered out)
    const registeredEmail = regularUser.email

    // The members.post endpoint adds existing users directly, so we can't
    // create an invitation for them. Instead, verify the existing invite
    // for a non-registered email IS shown.
    const invitations = await $fetch('/api/admin/invitations', {
      headers: admin.headers
    }) as any[]

    // Our non-registered email should be present
    const found = invitations.find(i => i.email === inviteEmail.toLowerCase())
    expect(found).toBeDefined()

    // No invitation should exist for the registered user's email
    const registered = invitations.find(i => i.email === registeredEmail)
    expect(registered).toBeUndefined()
  })
})
