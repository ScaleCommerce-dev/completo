import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('Project member management', () => {
  let owner: TestUser
  let member: TestUser
  let stranger: TestUser
  let admin: TestUser
  let project: Record<string, unknown>

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    stranger = await registerTestUser()
    admin = await createAdminUser()
    project = await createTestProject(owner)
  })

  it('owner can add member by email', async () => {
    const result = await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    }) as Record<string, unknown>

    // Uniform response — no user existence leak
    expect(result.added).toBe(true)
  })

  it('member list includes the new member', async () => {
    const members = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as Record<string, unknown>[]

    const found = members.find(m => m.id === member.id)
    expect(found).toBeDefined()
    expect(found.role).toBe('member')
  })

  it('non-owner member cannot add members', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/members`), {
      method: 'POST',
      headers: { ...member.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: stranger.email })
    })
    expect(res.status).toBe(403)
  })

  it('owner can remove a member', async () => {
    const result = await $fetch(`/api/projects/${project.id}/members/${member.id}`, {
      method: 'DELETE',
      headers: owner.headers
    }) as Record<string, unknown>

    expect(result.ok).toBe(true)

    const members = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as Record<string, unknown>[]
    expect(members.find(m => m.id === member.id)).toBeUndefined()
  })

  it('cannot remove last owner', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/members/${owner.id}`), {
      method: 'DELETE',
      headers: { ...owner.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message || body.data?.message).toContain('last owner')
  })

  // ── Role changes ──

  it('owner can promote member to owner', async () => {
    // Re-add member first
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const result = await $fetch(`/api/projects/${project.id}/members/${member.id}`, {
      method: 'PATCH',
      body: { role: 'owner' },
      headers: owner.headers
    }) as Record<string, unknown>

    expect(result.ok).toBe(true)
    expect(result.role).toBe('owner')

    const members = await $fetch(`/api/projects/${project.id}/members`, {
      headers: owner.headers
    }) as Record<string, unknown>[]
    expect(members.find(m => m.id === member.id)?.role).toBe('owner')
  })

  it('owner can demote another owner to member', async () => {
    const result = await $fetch(`/api/projects/${project.id}/members/${member.id}`, {
      method: 'PATCH',
      body: { role: 'member' },
      headers: owner.headers
    }) as Record<string, unknown>

    expect(result.ok).toBe(true)
    expect(result.role).toBe('member')
  })

  it('cannot demote the last owner', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/members/${owner.id}`), {
      method: 'PATCH',
      headers: { ...owner.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member' })
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message || body.data?.message).toContain('last owner')
  })

  it('non-owner member cannot change roles', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/members/${owner.id}`), {
      method: 'PATCH',
      headers: { ...member.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'owner' })
    })
    expect(res.status).toBe(403)
  })

  it('rejects invalid role value', async () => {
    const res = await fetch(url(`/api/projects/${project.id}/members/${member.id}`), {
      method: 'PATCH',
      headers: { ...owner.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' })
    })
    expect(res.status).toBe(400)
  })

  // Clean up member for subsequent tests
  it('owner removes member after role tests', async () => {
    await $fetch(`/api/projects/${project.id}/members/${member.id}`, {
      method: 'DELETE',
      headers: owner.headers
    })
  })

  it('admin can change roles on any project', async () => {
    // Admin adds stranger, promotes, then cleans up
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: stranger.email },
      headers: admin.headers
    })

    const result = await $fetch(`/api/projects/${project.id}/members/${stranger.id}`, {
      method: 'PATCH',
      body: { role: 'owner' },
      headers: admin.headers
    }) as Record<string, unknown>
    expect(result.ok).toBe(true)
    expect(result.role).toBe('owner')

    // Demote back and remove
    await $fetch(`/api/projects/${project.id}/members/${stranger.id}`, {
      method: 'PATCH',
      body: { role: 'member' },
      headers: admin.headers
    })
    await $fetch(`/api/projects/${project.id}/members/${stranger.id}`, {
      method: 'DELETE',
      headers: admin.headers
    })
  })

  it('admin can add and remove members on any project', async () => {
    // Admin adds stranger as member
    const addResult = await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: stranger.email },
      headers: admin.headers
    }) as Record<string, unknown>
    expect(addResult.added).toBe(true)

    // Admin removes stranger
    const removeResult = await $fetch(`/api/projects/${project.id}/members/${stranger.id}`, {
      method: 'DELETE',
      headers: admin.headers
    }) as Record<string, unknown>
    expect(removeResult.ok).toBe(true)
  })
})
