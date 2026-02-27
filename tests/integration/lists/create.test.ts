import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestList, getList } from '../../setup/fixtures'

describe('POST /api/projects/:id/lists', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates a list with default columns', async () => {
    const project = await createTestProject(user, { name: `List Create ${Date.now()}` })
    const list = await $fetch(`/api/projects/${project.id}/lists`, {
      method: 'POST',
      body: { name: 'All Cards' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(list.name).toBe('All Cards')
    expect(list.slug).toBe('all-cards')
    expect(list.projectId).toBe(project.id)
    expect(list.position).toBe(0)

    const fullList = await getList(user, list.id)
    expect(fullList.columns).toHaveLength(7)
    expect(fullList.columns.map((c: Record<string, unknown>) => c.field)).toEqual(['ticketId', 'title', 'status', 'priority', 'assignee', 'dueDate', 'tags'])
    expect(fullList.columns.map((c: Record<string, unknown>) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('creates a list with custom columns', async () => {
    const project = await createTestProject(user, { name: `List Custom Cols ${Date.now()}` })
    const list = await $fetch(`/api/projects/${project.id}/lists`, {
      method: 'POST',
      body: { name: 'Minimal', columns: ['title', 'status'] },
      headers: user.headers
    }) as Record<string, unknown>

    const fullList = await getList(user, list.id)
    expect(fullList.columns).toHaveLength(2)
    expect(fullList.columns.map((c: Record<string, unknown>) => c.field)).toEqual(['title', 'status'])
  })

  it('auto-generates slug from name', async () => {
    const project = await createTestProject(user, { name: `List Slug ${Date.now()}` })
    const list = await $fetch(`/api/projects/${project.id}/lists`, {
      method: 'POST',
      body: { name: 'My Sprint List' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(list.slug).toBe('my-sprint-list')
  })

  it('handles slug collision by appending suffix', async () => {
    const project = await createTestProject(user, { name: `List Slug Collision ${Date.now()}` })

    const list1 = await $fetch(`/api/projects/${project.id}/lists`, {
      method: 'POST',
      body: { name: 'Sprint', slug: 'sprint' },
      headers: user.headers
    }) as Record<string, unknown>

    const list2 = await $fetch(`/api/projects/${project.id}/lists`, {
      method: 'POST',
      body: { name: 'Sprint', slug: 'sprint' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(list1.slug).toBe('sprint')
    expect(list2.slug).toMatch(/^sprint-[a-z0-9]{4}$/)
    expect(list2.slug).not.toBe(list1.slug)
  })

  it('increments position for subsequent lists', async () => {
    const project = await createTestProject(user, { name: `List Pos ${Date.now()}` })

    const list1 = await createTestList(user, project.id, { name: 'First' })
    const list2 = await createTestList(user, project.id, { name: 'Second' })

    expect(list1.position).toBe(0)
    expect(list2.position).toBe(1)
  })

  it('rejects missing name', async () => {
    const project = await createTestProject(user, { name: `List No Name ${Date.now()}` })
    await expectError($fetch(`/api/projects/${project.id}/lists`, {
      method: 'POST',
      body: {},
      headers: user.headers
    }), 400)
  })
})
