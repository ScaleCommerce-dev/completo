import { describe, it, expect } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('DELETE /api/user/account', async () => {
  it('deletes account with correct password', async () => {
    const user = await registerTestUser({ password: 'deleteMe123' })

    const result = await $fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'deleteMe123' },
      headers: user.headers
    }) as any

    expect(result.ok).toBe(true)

    // Verify can't log in anymore
    const loginRes = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'deleteMe123' })
    })
    expect(loginRes.status).toBe(401)
  })

  it('rejects wrong password', async () => {
    const user = await registerTestUser({ password: 'correct123' })

    await expectError($fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'wrongpassword' },
      headers: user.headers
    }), 401)
  })

  it('rejects missing password', async () => {
    const user = await registerTestUser()

    await expectError($fetch('/api/user/account', {
      method: 'DELETE',
      body: {},
      headers: user.headers
    }), 400)
  })

  it('blocks admin self-deletion', async () => {
    const admin = await createAdminUser()

    await expectError($fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'testpass123' },
      headers: admin.headers
    }), 403)
  })

  it('cascades membership cleanup', async () => {
    const owner = await registerTestUser({ password: 'ownerPass1' })
    const member = await registerTestUser({ password: 'memberPass1' })

    const project = await createTestProject(owner)

    // Add member to project
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    // Verify member is listed
    const membersBefore = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as any[]
    expect(membersBefore.some((m: any) => m.id === member.id)).toBe(true)

    // Delete member's account
    await $fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'memberPass1' },
      headers: member.headers
    })

    // Verify membership is gone
    const membersAfter = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as any[]
    expect(membersAfter.some((m: any) => m.id === member.id)).toBe(false)
  })

  it('rejects unauthenticated requests', async () => {
    const res = await fetch(url('/api/user/account'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'whatever' })
    })
    expect(res.status).toBe(401)
  })
})
