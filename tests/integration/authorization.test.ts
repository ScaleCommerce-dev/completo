import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../setup/fixtures'

describe('Resource-level authorization', async () => {
  let owner: TestUser
  let member: TestUser
  let stranger: TestUser
  let project: { id: string, name: string, slug: string, key: string }
  let board: { id: string, name: string, slug: string, projectId: string }
  let fullBoard: Awaited<ReturnType<typeof getBoard>>
  let card: { id: number, statusId: string, projectId: string }

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    stranger = await registerTestUser()

    project = await createTestProject(owner)

    // Add member to project
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    board = await createTestBoard(owner, project.id)
    fullBoard = await getBoard(owner, board.id)
    card = await createTestCard(owner, board.id, fullBoard.columns[0].id, {
      title: 'Auth Test Card'
    })
  })

  // --- Projects ---

  describe('GET /api/projects/[id]', () => {
    it('allows member access', async () => {
      const res = await $fetch(`/api/projects/${project.id}`, {
        headers: member.headers
      }) as Record<string, unknown>
      expect(res.id).toBe(project.id)
    })

    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}`), {
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })

    it('rejects stranger when accessing by slug', async () => {
      const res = await fetch(url(`/api/projects/${project.slug}`), {
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/projects/[id]', () => {
    it('allows owner to update', async () => {
      const res = await $fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: { name: project.name },
        headers: owner.headers
      }) as Record<string, unknown>
      expect(res.id).toBe(project.id)
    })

    it('rejects member (not owner) with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}`), {
        method: 'PUT',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated by member' })
      })
      expect(res.status).toBe(403)
    })

    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/projects/[id]', () => {
    it('rejects member (not owner) with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}`), {
        method: 'DELETE',
        headers: member.headers
      })
      expect(res.status).toBe(403)
    })

    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}`), {
        method: 'DELETE',
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Members ---

  describe('GET /api/projects/[id]/members', () => {
    it('allows member access', async () => {
      const res = await $fetch(`/api/projects/${project.id}/members`, {
        headers: member.headers
      }) as Record<string, unknown>[]
      expect(res.length).toBeGreaterThanOrEqual(2)
    })

    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/[id]/members', () => {
    it('rejects member (not owner) with 403', async () => {
      const extra = await registerTestUser()
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: extra.email })
      })
      expect(res.status).toBe(403)
    })

    it('rejects stranger with 403', async () => {
      const extra = await registerTestUser()
      const res = await fetch(url(`/api/projects/${project.id}/members`), {
        method: 'POST',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: extra.email })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/projects/[id]/members/[userId]', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/members/${member.id}`), {
        method: 'DELETE',
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Boards ---

  describe('GET /api/boards/[id]', () => {
    it('allows member access', async () => {
      const res = await $fetch(`/api/boards/${board.id}`, {
        headers: member.headers
      }) as Record<string, unknown>
      expect(res.id).toBe(board.id)
    })

    it('rejects stranger with 404', async () => {
      const res = await fetch(url(`/api/boards/${board.id}`), {
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/boards/[id]', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/boards/${board.id}`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked Board' })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/boards/[id]', () => {
    it('rejects stranger with 403', async () => {
      // Create a disposable board to test against
      const tempBoard = await createTestBoard(owner, project.id, { name: `Temp Del ${Date.now()}` })
      const res = await fetch(url(`/api/boards/${tempBoard.id}`), {
        method: 'DELETE',
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/[id]/boards', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/projects/${project.id}/boards`), {
        method: 'POST',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked Board' })
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Columns ---

  describe('POST /api/boards/[id]/columns', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/boards/${board.id}/columns`), {
        method: 'POST',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked Column' })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/boards/[id]/columns/reorder', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/boards/${board.id}/columns/reorder`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: [{ id: fullBoard.columns[0].id, position: 0 }] })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/statuses/[id]', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/statuses/${fullBoard.columns[0].id}`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/statuses/[id]', () => {
    it('rejects stranger with 403', async () => {
      // Create a disposable status to test
      const col = await $fetch(`/api/boards/${board.id}/columns`, {
        method: 'POST',
        body: { name: `Temp Col ${Date.now()}` },
        headers: owner.headers
      }) as Record<string, unknown>

      const res = await fetch(url(`/api/statuses/${col.id}`), {
        method: 'DELETE',
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Cards ---

  describe('POST /api/boards/[id]/cards', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/boards/${board.id}/cards`), {
        method: 'POST',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: fullBoard.columns[0].id, title: 'Hacked Card' })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/cards/[id]', () => {
    it('allows member to update', async () => {
      const res = await $fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        body: { title: 'Updated by member' },
        headers: member.headers
      }) as Record<string, unknown>
      expect(res.title).toBe('Updated by member')
    })

    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/cards/${card.id}`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked' })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/cards/[id]', () => {
    it('rejects stranger with 403', async () => {
      const tempCard = await createTestCard(owner, board.id, fullBoard.columns[0].id, {
        title: `Temp Del Card ${Date.now()}`
      })
      const res = await fetch(url(`/api/cards/${tempCard.id}`), {
        method: 'DELETE',
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/cards/[id]/move', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/cards/${card.id}/move`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: fullBoard.columns[1].id, position: 0 })
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/boards/[id]/cards/reorder', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/boards/${board.id}/cards/reorder`), {
        method: 'PUT',
        headers: { ...stranger.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves: [{ cardId: card.id, statusId: fullBoard.columns[0].id, position: 0 }] })
      })
      expect(res.status).toBe(404)
    })
  })

  // --- Board slug check ---

  describe('GET /api/boards/check-slug', () => {
    it('rejects stranger with 403', async () => {
      const res = await fetch(url(`/api/boards/check-slug?slug=test&projectId=${project.id}`), {
        headers: stranger.headers
      })
      expect(res.status).toBe(404)
    })
  })
})
