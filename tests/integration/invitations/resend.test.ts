import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createInvitation } from '../../setup/fixtures'

describe('POST /api/projects/[id]/invitations/[invitationId]/resend', () => {
  let owner: TestUser
  let member: TestUser
  let project: any
  let invitationId: string
  const inviteEmail = `resend-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    project = await createTestProject(owner)

    // Add member to project
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { userId: member.id },
      headers: owner.headers
    })

    // Create an invitation
    await createInvitation(owner, project.id, inviteEmail)

    // Get invitation ID
    const invitations = await $fetch(`/api/projects/${project.id}/invitations`, {
      headers: owner.headers
    }) as any[]
    const inv = invitations.find(i => i.email === inviteEmail.toLowerCase())
    invitationId = inv.id
  })

  it('owner can resend invitation', async () => {
    const result = await $fetch(`/api/projects/${project.id}/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers: owner.headers
    }) as any

    expect(result.ok).toBe(true)
  })

  it('non-owner gets 403', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/invitations/${invitationId}/resend`), {
      method: 'POST',
      headers: member.headers
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent invitation', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/invitations/non-existent-id/resend`), {
      method: 'POST',
      headers: owner.headers
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 for invitation from different project (IDOR prevention)', async () => {
    const otherOwner = await registerTestUser()
    const otherProject = await createTestProject(otherOwner)
    const otherEmail = `idor-${Date.now()}@example.com`
    await createInvitation(otherOwner, otherProject.id, otherEmail)

    const otherInvitations = await $fetch(`/api/projects/${otherProject.id}/invitations`, {
      headers: otherOwner.headers
    }) as any[]
    const otherInvId = otherInvitations.find(i => i.email === otherEmail.toLowerCase())!.id

    // Try to resend other project's invitation via our project
    const res = await fetch(url(`/api/projects/${project.id}/invitations/${otherInvId}/resend`), {
      method: 'POST',
      headers: owner.headers
    })
    expect(res.status).toBe(404)
  })

  it('admin can resend invitation', async () => {
    const admin = await createAdminUser()
    const result = await $fetch(`/api/projects/${project.id}/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers: admin.headers
    }) as any

    expect(result.ok).toBe(true)
  })
})
