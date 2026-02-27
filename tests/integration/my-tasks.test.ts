import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../setup/fixtures'

describe('GET /api/my-tasks', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('returns empty groups when user has no assigned cards', async () => {
    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any

    expect(data.groups).toEqual([])
    expect(data.columns).toBeDefined()
    expect(Array.isArray(data.columns)).toBe(true)
    expect(data.collapsedProjectIds).toEqual([])
  })

  it('returns cards grouped by project with full card objects', async () => {
    const project = await createTestProject(user, { name: `My Tasks ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    await createTestCard(user, board.id, fullBoard.columns[0].id, {
      title: 'Assigned Task',
      assigneeId: user.id
    })

    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any

    const group = data.groups.find((g: any) => g.project.id === project.id)
    expect(group).toBeTruthy()
    expect(group.cards).toHaveLength(1)
    expect(group.cards[0].title).toBe('Assigned Task')
    // Full card objects should have status and assignee
    expect(group.cards[0].status).toBeTruthy()
    expect(group.cards[0].status.name).toBeTruthy()
    expect(group.cards[0].assignee).toBeTruthy()
    expect(group.cards[0].assignee.id).toBe(user.id)
    // Tags should be an array
    expect(Array.isArray(group.cards[0].tags)).toBe(true)
    // Project should have key for ticket IDs
    expect(group.project.key).toBeTruthy()
    expect(group.project.slug).toBeTruthy()
    // Statuses should be present
    expect(group.statuses.length).toBeGreaterThan(0)
  })

  it('does not return cards assigned to other users', async () => {
    const user2 = await registerTestUser()
    const project = await createTestProject(user, { name: `Other User ${Date.now()}` })

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: user2.email },
      headers: user.headers
    })

    const board = await createTestBoard(user, project.id)
    const fullBoard = await getBoard(user, board.id)

    await createTestCard(user, board.id, fullBoard.columns[0].id, {
      title: 'User2 Task',
      assigneeId: user2.id
    })

    const data = await $fetch('/api/my-tasks', {
      headers: user.headers
    }) as any

    const group = data.groups.find((g: any) => g.project.id === project.id)
    if (group) {
      const user2Task = group.cards.find((t: any) => t.title === 'User2 Task')
      expect(user2Task).toBeUndefined()
    }
  })
})
