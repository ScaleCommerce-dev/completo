import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { createTestProject, createTestBoard, createTestList, getBoard, getList } from '../setup/fixtures'

describe('View filters (status, assignee, priority)', () => {
  let user: TestUser
  let projectId: string
  let boardId: string
  let listId: string

  beforeAll(async () => {
    user = await registerTestUser()
    const project = await createTestProject(user, { name: `Filters ${Date.now()}` })
    projectId = project.id
    const board = await createTestBoard(user, projectId)
    boardId = board.id
    const list = await createTestList(user, projectId)
    listId = list.id
  })

  describe('GET responses include filter fields', () => {
    it('board GET returns empty filter arrays by default', async () => {
      const board = await getBoard(user, boardId) as Record<string, unknown>
      expect(board.tagFilters).toEqual([])
      expect(board.statusFilters).toEqual([])
      expect(board.assigneeFilters).toEqual([])
      expect(board.priorityFilters).toEqual([])
    })

    it('list GET returns empty filter arrays by default', async () => {
      const list = await getList(user, listId)
      expect((list as Record<string, unknown>).tagFilters).toEqual([])
      expect((list as Record<string, unknown>).statusFilters).toEqual([])
      expect((list as Record<string, unknown>).assigneeFilters).toEqual([])
      expect((list as Record<string, unknown>).priorityFilters).toEqual([])
    })
  })

  describe('PUT board filters', () => {
    it('persists statusFilters', async () => {
      const board = await getBoard(user, boardId)
      const statusId = board.columns[0]?.id
      if (!statusId) return

      await $fetch(`/api/boards/${boardId}`, {
        method: 'PUT',
        body: { statusFilters: [statusId] },
        headers: user.headers
      })

      const updated = await getBoard(user, boardId) as Record<string, unknown>
      expect(updated.statusFilters).toEqual([statusId])
    })

    it('persists priorityFilters', async () => {
      await $fetch(`/api/boards/${boardId}`, {
        method: 'PUT',
        body: { priorityFilters: ['high', 'urgent'] },
        headers: user.headers
      })

      const updated = await getBoard(user, boardId) as Record<string, unknown>
      expect(updated.priorityFilters).toEqual(['high', 'urgent'])
    })

    it('persists assigneeFilters', async () => {
      await $fetch(`/api/boards/${boardId}`, {
        method: 'PUT',
        body: { assigneeFilters: [user.id] },
        headers: user.headers
      })

      const updated = await getBoard(user, boardId) as Record<string, unknown>
      expect(updated.assigneeFilters).toEqual([user.id])
    })

    it('clears filters with empty array', async () => {
      await $fetch(`/api/boards/${boardId}`, {
        method: 'PUT',
        body: { statusFilters: [], priorityFilters: [], assigneeFilters: [] },
        headers: user.headers
      })

      const updated = await getBoard(user, boardId) as Record<string, unknown>
      expect(updated.statusFilters).toEqual([])
      expect(updated.priorityFilters).toEqual([])
      expect(updated.assigneeFilters).toEqual([])
    })
  })

  describe('PUT list filters', () => {
    it('persists statusFilters', async () => {
      const list = await getList(user, listId)
      const statusId = list.statuses[0]?.id
      if (!statusId) return

      await $fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        body: { statusFilters: [statusId] },
        headers: user.headers
      })

      const updated = await getList(user, listId)
      expect((updated as Record<string, unknown>).statusFilters).toEqual([statusId])
    })

    it('persists priorityFilters', async () => {
      await $fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        body: { priorityFilters: ['medium', 'low'] },
        headers: user.headers
      })

      const updated = await getList(user, listId)
      expect((updated as Record<string, unknown>).priorityFilters).toEqual(['medium', 'low'])
    })

    it('persists assigneeFilters', async () => {
      await $fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        body: { assigneeFilters: [user.id] },
        headers: user.headers
      })

      const updated = await getList(user, listId)
      expect((updated as Record<string, unknown>).assigneeFilters).toEqual([user.id])
    })

    it('clears filters with empty array', async () => {
      await $fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        body: { statusFilters: [], priorityFilters: [], assigneeFilters: [] },
        headers: user.headers
      })

      const updated = await getList(user, listId)
      expect((updated as Record<string, unknown>).statusFilters).toEqual([])
      expect((updated as Record<string, unknown>).priorityFilters).toEqual([])
      expect((updated as Record<string, unknown>).assigneeFilters).toEqual([])
    })
  })

  describe('multiple filters at once', () => {
    it('persists all filter types in a single PUT', async () => {
      const list = await getList(user, listId)
      const statusId = list.statuses[0]?.id
      if (!statusId) return

      await $fetch(`/api/lists/${listId}`, {
        method: 'PUT',
        body: {
          statusFilters: [statusId],
          priorityFilters: ['high'],
          assigneeFilters: [user.id],
          tagFilters: []
        },
        headers: user.headers
      })

      const updated = await getList(user, listId)
      expect((updated as Record<string, unknown>).statusFilters).toEqual([statusId])
      expect((updated as Record<string, unknown>).priorityFilters).toEqual(['high'])
      expect((updated as Record<string, unknown>).assigneeFilters).toEqual([user.id])
      expect((updated as Record<string, unknown>).tagFilters).toEqual([])
    })
  })
})
