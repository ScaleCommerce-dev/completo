import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestList, getList } from '../../setup/fixtures'

describe('List columns', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  describe('POST /api/lists/:id/columns', () => {
    it('adds a field column to the list', async () => {
      const project = await createTestProject(user, { name: `Col Add ${Date.now()}` })
      const list = await createTestList(user, project.id, { columns: ['title', 'status'] })

      const col = await $fetch(`/api/lists/${list.id}/columns`, {
        method: 'POST',
        body: { field: 'priority' },
        headers: user.headers
      }) as any

      expect(col.field).toBe('priority')
      expect(col.position).toBe(2) // after title(0) and status(1)

      const fullList = await getList(user, list.id)
      expect(fullList.columns).toHaveLength(3)
      expect(fullList.columns.map((c: any) => c.field)).toContain('priority')
    })

    it('rejects invalid field', async () => {
      const project = await createTestProject(user, { name: `Col Invalid ${Date.now()}` })
      const list = await createTestList(user, project.id)

      await expectError($fetch(`/api/lists/${list.id}/columns`, {
        method: 'POST',
        body: { field: 'invalid-field' },
        headers: user.headers
      }), 400)
    })

    it('rejects duplicate field', async () => {
      const project = await createTestProject(user, { name: `Col Dup ${Date.now()}` })
      const list = await createTestList(user, project.id) // default columns include 'title'

      await expectError($fetch(`/api/lists/${list.id}/columns`, {
        method: 'POST',
        body: { field: 'title' },
        headers: user.headers
      }), 409)
    })

    it('rejects missing field', async () => {
      const project = await createTestProject(user, { name: `Col Missing ${Date.now()}` })
      const list = await createTestList(user, project.id)

      await expectError($fetch(`/api/lists/${list.id}/columns`, {
        method: 'POST',
        body: {},
        headers: user.headers
      }), 400)
    })
  })

  describe('DELETE /api/lists/:id/columns/:columnId', () => {
    it('removes a column from the list', async () => {
      const project = await createTestProject(user, { name: `Col Del ${Date.now()}` })
      const list = await createTestList(user, project.id)

      const fullList = await getList(user, list.id)
      const colToRemove = fullList.columns[0]

      const result = await $fetch(`/api/lists/${list.id}/columns/${colToRemove.id}`, {
        method: 'DELETE',
        headers: user.headers
      }) as any

      expect(result.ok).toBe(true)

      const updated = await getList(user, list.id)
      expect(updated.columns).toHaveLength(fullList.columns.length - 1)
      expect(updated.columns.find((c: any) => c.id === colToRemove.id)).toBeFalsy()
    })

    it('returns 404 for non-existent column', async () => {
      const project = await createTestProject(user, { name: `Col Del NF ${Date.now()}` })
      const list = await createTestList(user, project.id)

      const res = await fetch(url(`/api/lists/${list.id}/columns/nonexistent`), {
        method: 'DELETE',
        headers: user.headers
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/lists/:id/columns/reorder', () => {
    it('reorders columns', async () => {
      const project = await createTestProject(user, { name: `Col Reorder ${Date.now()}` })
      const list = await createTestList(user, project.id, { columns: ['title', 'status', 'priority'] })

      const fullList = await getList(user, list.id)
      const reversed = fullList.columns.map((c: any, i: number) => ({
        id: c.id,
        position: fullList.columns.length - 1 - i
      }))

      const result = await $fetch(`/api/lists/${list.id}/columns/reorder`, {
        method: 'PUT',
        body: { columns: reversed },
        headers: user.headers
      }) as any

      expect(result.ok).toBe(true)

      const updated = await getList(user, list.id)
      expect(updated.columns[0].field).toBe('priority')
      expect(updated.columns[1].field).toBe('status')
      expect(updated.columns[2].field).toBe('title')
    })

    it('rejects empty columns array', async () => {
      const project = await createTestProject(user, { name: `Col Reorder Empty ${Date.now()}` })
      const list = await createTestList(user, project.id)

      await expectError($fetch(`/api/lists/${list.id}/columns/reorder`, {
        method: 'PUT',
        body: { columns: [] },
        headers: user.headers
      }), 400)
    })
  })
})
