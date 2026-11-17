import { describe, it, expect } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser } from '../../setup/auth'
import { createTestProject, addProjectMember } from '../../setup/fixtures'

describe('DELETE /api/user/account', async () => {
  it('deletes account with correct password', async () => {
    const user = await registerTestUser({ password: 'deleteMe123' })

    const result = await $fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'deleteMe123' },
      headers: user.headers
    }) as Record<string, unknown>

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

  it('refuses while the account is the only owner of a project, and says which', async () => {
    const owner = await registerTestUser({ password: 'ownerPass1' })
    const project = await createTestProject(owner, { name: `Stranded ${Date.now()}` })
    const res = await fetch(url('/api/user/account'), {
      method: 'DELETE',
      headers: { ...owner.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'ownerPass1' })
    })
    expect(res.status).toBe(409)
    expect((await res.json()).message).toContain(project.name)

    // With a second owner it goes through.
    const other = await registerTestUser()
    await addProjectMember(owner, project.id, { email: other.email })
    await $fetch(`/api/projects/${project.id}/members/${other.id}`, { method: 'PATCH', body: { role: 'owner' }, headers: owner.headers })
    const ok = await $fetch<{ ok: boolean }>('/api/user/account', { method: 'DELETE', body: { password: 'ownerPass1' }, headers: owner.headers })
    expect(ok.ok).toBe(true)
  })

  it('stops guessing the password after ten tries', async () => {
    const user = await registerTestUser({ password: 'rightPass1' })
    const attempt = () => fetch(url('/api/user/account'), {
      method: 'DELETE',
      headers: { ...user.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrongPass1' })
    })
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(429)
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
    await addProjectMember(owner, project.id, { email: member.email })

    // Verify member is listed
    const membersBefore = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as Record<string, unknown>[]
    expect(membersBefore.some((m: Record<string, unknown>) => m.id === member.id)).toBe(true)

    // Delete member's account
    await $fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'memberPass1' },
      headers: member.headers
    })

    // Verify membership is gone
    const membersAfter = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as Record<string, unknown>[]
    expect(membersAfter.some((m: Record<string, unknown>) => m.id === member.id)).toBe(false)
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
