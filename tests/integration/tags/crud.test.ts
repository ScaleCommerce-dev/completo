import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestTag } from '../../setup/fixtures'

describe('Tag CRUD', async () => {
  let owner: TestUser
  let member: TestUser
  let projectId: string

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()

    const project = await createTestProject(owner)
    projectId = project.id

    // Add member
    await $fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      body: { userId: member.id },
      headers: owner.headers
    })
  })

  // ─── POST /api/projects/:id/tags ───

  it('creates a tag with name and color', async () => {
    const tag = await $fetch(`/api/projects/${projectId}/tags`, {
      method: 'POST',
      body: { name: 'Bug', color: '#ef4444' },
      headers: owner.headers
    }) as Record<string, unknown>

    expect(tag.id).toBeDefined()
    expect(tag.projectId).toBe(projectId)
    expect(tag.name).toBe('Bug')
    expect(tag.color).toBe('#ef4444')
  })

  it('creates a tag with default color when color not provided', async () => {
    const tag = await $fetch(`/api/projects/${projectId}/tags`, {
      method: 'POST',
      body: { name: 'Feature' },
      headers: owner.headers
    }) as Record<string, unknown>

    expect(tag.color).toBe('#6366f1')
  })

  it('rejects missing name', async () => {
    const res = await fetch(url(`/api/projects/${projectId}/tags`), {
      method: 'POST',
      body: JSON.stringify({ color: '#ef4444' }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })

  it('rejects member (non-owner) creating tags', async () => {
    const res = await fetch(url(`/api/projects/${projectId}/tags`), {
      method: 'POST',
      body: JSON.stringify({ name: 'Nope' }),
      headers: { ...member.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent project', async () => {
    const res = await fetch(url('/api/projects/nonexistent/tags'), {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(404)
  })

  // ─── GET /api/projects/:id/tags ───

  it('lists all tags for a project', async () => {
    const tags = await $fetch(`/api/projects/${projectId}/tags`, {
      headers: owner.headers
    }) as Record<string, unknown>[]

    expect(tags.length).toBeGreaterThanOrEqual(2)
    expect(tags[0]).toHaveProperty('id')
    expect(tags[0]).toHaveProperty('name')
    expect(tags[0]).toHaveProperty('color')
  })

  it('allows any project member to list tags', async () => {
    const tags = await $fetch(`/api/projects/${projectId}/tags`, {
      headers: member.headers
    }) as Record<string, unknown>[]

    expect(tags.length).toBeGreaterThanOrEqual(2)
  })

  it('returns default tags for new project', async () => {
    const project2 = await createTestProject(owner)
    const tags = await $fetch(`/api/projects/${project2.id}/tags`, {
      headers: owner.headers
    }) as Record<string, unknown>[]

    expect(tags.length).toBe(3)
    expect(tags.map((t: Record<string, unknown>) => t.name).sort()).toEqual(['Bug', 'Discuss', 'Feature'])
  })

  // ─── PUT /api/tags/:id ───

  it('updates tag name', async () => {
    const tag = await createTestTag(owner, projectId)
    const updated = await $fetch(`/api/tags/${tag.id}`, {
      method: 'PUT',
      body: { name: 'Updated Name' },
      headers: owner.headers
    }) as Record<string, unknown>

    expect(updated.name).toBe('Updated Name')
    expect(updated.color).toBe(tag.color)
  })

  it('updates tag color', async () => {
    const tag = await createTestTag(owner, projectId)
    const updated = await $fetch(`/api/tags/${tag.id}`, {
      method: 'PUT',
      body: { color: '#10b981' },
      headers: owner.headers
    }) as Record<string, unknown>

    expect(updated.color).toBe('#10b981')
    expect(updated.name).toBe(tag.name)
  })

  it('rejects member (non-owner) updating tags', async () => {
    const tag = await createTestTag(owner, projectId)
    const res = await fetch(url(`/api/tags/${tag.id}`), {
      method: 'PUT',
      body: JSON.stringify({ name: 'Nope' }),
      headers: { ...member.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent tag', async () => {
    const res = await fetch(url('/api/tags/nonexistent'), {
      method: 'PUT',
      body: JSON.stringify({ name: 'Nope' }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(404)
  })

  // ─── DELETE /api/tags/:id ───

  it('deletes a tag', async () => {
    const tag = await createTestTag(owner, projectId)
    const result = await $fetch(`/api/tags/${tag.id}`, {
      method: 'DELETE',
      headers: owner.headers
    }) as Record<string, unknown>

    expect(result.ok).toBe(true)

    // Verify it's gone
    const res = await fetch(url(`/api/tags/${tag.id}`), {
      method: 'PUT',
      body: JSON.stringify({ name: 'Ghost' }),
      headers: { ...owner.headers, 'content-type': 'application/json' }
    })
    expect(res.status).toBe(404)
  })

  it('rejects member (non-owner) deleting tags', async () => {
    const tag = await createTestTag(owner, projectId)
    const res = await fetch(url(`/api/tags/${tag.id}`), {
      method: 'DELETE',
      headers: member.headers
    })
    expect(res.status).toBe(403)
  })
})
