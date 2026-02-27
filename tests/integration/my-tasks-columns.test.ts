import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../setup/fixtures'

describe('My Tasks Columns', async () => {
  let user: TestUser

  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('GET /api/my-tasks seeds default columns', async () => {
    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any

    expect(data.columns.length).toBe(7)
    expect(data.columns.map((c: any) => c.field)).toEqual([
      'done', 'ticketId', 'title', 'status', 'priority', 'dueDate', 'tags'
    ])
  })

  it('POST /api/my-tasks/columns adds a field column', async () => {
    const col = await $fetch('/api/my-tasks/columns', {
      method: 'POST',
      body: { field: 'createdAt' },
      headers: user.headers
    }) as any

    expect(col.field).toBe('createdAt')
    expect(col.id).toBeTruthy()
    expect(col.position).toBeGreaterThanOrEqual(0)

    // Verify it appears in GET
    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any
    expect(data.columns.some((c: any) => c.field === 'createdAt')).toBe(true)
  })

  it('POST /api/my-tasks/columns rejects invalid field', async () => {
    const res = await fetch(url('/api/my-tasks/columns'), {
      method: 'POST',
      body: JSON.stringify({ field: 'nonexistent' }),
      headers: { ...user.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/my-tasks/columns rejects duplicate field', async () => {
    const res = await fetch(url('/api/my-tasks/columns'), {
      method: 'POST',
      body: JSON.stringify({ field: 'title' }),
      headers: { ...user.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(409)
  })

  it('DELETE /api/my-tasks/columns/:id removes a column', async () => {
    // Add a column to remove
    const col = await $fetch('/api/my-tasks/columns', {
      method: 'POST',
      body: { field: 'description' },
      headers: user.headers
    }) as any

    const result = await $fetch(`/api/my-tasks/columns/${col.id}`, {
      method: 'DELETE',
      headers: user.headers
    }) as any

    expect(result.ok).toBe(true)

    // Verify it's gone
    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any
    expect(data.columns.some((c: any) => c.field === 'description')).toBe(false)
  })

  it('DELETE /api/my-tasks/columns/:id returns 404 for non-existent', async () => {
    const res = await fetch(url('/api/my-tasks/columns/nonexistent-id'), {
      method: 'DELETE',
      headers: user.headers
    })
    expect(res.status).toBe(404)
  })

  it('PUT /api/my-tasks/columns/reorder reorders columns', async () => {
    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any

    const reversed = data.columns.map((c: any, i: number) => ({
      id: c.id,
      position: data.columns.length - 1 - i
    }))

    const result = await $fetch('/api/my-tasks/columns/reorder', {
      method: 'PUT',
      body: { columns: reversed },
      headers: user.headers
    }) as any

    expect(result.ok).toBe(true)

    const updated = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any

    // First column should now be what was last
    expect(updated.columns[0].id).toBe(data.columns[data.columns.length - 1].id)
  })

  it('PUT /api/my-tasks/columns/reorder rejects empty array', async () => {
    const res = await fetch(url('/api/my-tasks/columns/reorder'), {
      method: 'PUT',
      body: JSON.stringify({ columns: [] }),
      headers: { ...user.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })
})

describe('My Tasks Collapse', async () => {
  let user: TestUser

  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('POST /api/my-tasks/collapse toggles collapse state', async () => {
    const project = await createTestProject(user, { name: `Collapse Test ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    await createTestCard(user, board.id, fullBoard.columns[0].id, {
      title: 'Collapse Card',
      assigneeId: user.id
    })

    // Collapse the project
    const result1 = await $fetch('/api/my-tasks/collapse', {
      method: 'POST',
      body: { projectId: project.id },
      headers: user.headers
    }) as any
    expect(result1.collapsed).toBe(true)

    // Verify it appears in GET
    const data1 = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any
    expect(data1.collapsedProjectIds).toContain(project.id)

    // Uncollapse
    const result2 = await $fetch('/api/my-tasks/collapse', {
      method: 'POST',
      body: { projectId: project.id },
      headers: user.headers
    }) as any
    expect(result2.collapsed).toBe(false)

    // Verify it's removed
    const data2 = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any
    expect(data2.collapsedProjectIds).not.toContain(project.id)
  })

  it('POST /api/my-tasks/collapse requires projectId', async () => {
    const res = await fetch(url('/api/my-tasks/collapse'), {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { ...user.headers, 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(400)
  })
})
