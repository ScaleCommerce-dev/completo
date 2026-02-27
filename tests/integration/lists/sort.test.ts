import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestList, getList } from '../../setup/fixtures'

describe('List sort fields (PUT /api/lists/:id)', async () => {
  let owner: TestUser
  let member: TestUser
  let project: any
  let list: any

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    project = await createTestProject(owner, { name: `Sort Test ${Date.now()}` })
    // Add member
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { userId: member.id },
      headers: owner.headers
    })
    list = await createTestList(owner, project.id, { name: 'Sortable' })
  })

  it('saves sortField and sortDirection', async () => {
    const updated = await $fetch(`/api/lists/${list.id}`, {
      method: 'PUT',
      body: { sortField: 'priority', sortDirection: 'asc' },
      headers: owner.headers
    }) as any

    expect(updated.sortField).toBe('priority')
    expect(updated.sortDirection).toBe('asc')
  })

  it('persists sort in GET response', async () => {
    const fullList = await getList(owner, list.id)
    expect(fullList).toHaveProperty('sortField', 'priority')
    expect(fullList).toHaveProperty('sortDirection', 'asc')
  })

  it('clears sort with null values', async () => {
    const updated = await $fetch(`/api/lists/${list.id}`, {
      method: 'PUT',
      body: { sortField: null, sortDirection: null },
      headers: owner.headers
    }) as any

    expect(updated.sortField).toBeNull()
    expect(updated.sortDirection).toBeNull()
  })

  it('rejects invalid sortField', async () => {
    const res = await fetch(url(`/api/lists/${list.id}`), {
      method: 'PUT',
      body: JSON.stringify({ sortField: 'tags', sortDirection: 'asc' }),
      headers: { ...owner.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid sortDirection', async () => {
    const res = await fetch(url(`/api/lists/${list.id}`), {
      method: 'PUT',
      body: JSON.stringify({ sortField: 'title', sortDirection: 'sideways' }),
      headers: { ...owner.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })

  it('rejects sort update from regular member', async () => {
    const res = await fetch(url(`/api/lists/${list.id}`), {
      method: 'PUT',
      body: JSON.stringify({ sortField: 'title', sortDirection: 'asc' }),
      headers: { ...member.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(403)
  })

  it('validates all sortable fields', async () => {
    for (const field of ['ticketId', 'title', 'status', 'priority', 'assignee', 'createdAt', 'updatedAt']) {
      const updated = await $fetch(`/api/lists/${list.id}`, {
        method: 'PUT',
        body: { sortField: field, sortDirection: 'desc' },
        headers: owner.headers
      }) as any
      expect(updated.sortField).toBe(field)
    }
  })
})
