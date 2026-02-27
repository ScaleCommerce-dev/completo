import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'

describe('Admin Skills CRUD', () => {
  let admin: TestUser
  let regularUser: TestUser
  let skillId: string

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
  })

  describe('POST /api/admin/skills', () => {
    it('admin can create a skill', async () => {
      const skill = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: 'Test Skill', prompt: 'Do something with {title}', scope: 'card' },
        headers: admin.headers
      }) as any

      expect(skill.id).toBeDefined()
      expect(skill.name).toBe('Test Skill')
      expect(skill.prompt).toBe('Do something with {title}')
      expect(skill.scope).toBe('card')
      expect(skill.position).toBeTypeOf('number')
      skillId = skill.id
    })

    it('creates with default scope card', async () => {
      const skill = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: 'No Scope Skill', prompt: 'A prompt' },
        headers: admin.headers
      }) as any

      expect(skill.scope).toBe('card')
    })

    it('rejects missing name', async () => {
      const res = await fetch(url('/api/admin/skills'), {
        method: 'POST',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'A prompt' })
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing prompt', async () => {
      const res = await fetch(url('/api/admin/skills'), {
        method: 'POST',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' })
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid scope', async () => {
      const res = await fetch(url('/api/admin/skills'), {
        method: 'POST',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', prompt: 'Prompt', scope: 'invalid' })
      })
      expect(res.status).toBe(400)
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url('/api/admin/skills'), {
        method: 'POST',
        headers: { ...regularUser.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', prompt: 'Prompt' })
      })
      expect(res.status).toBe(403)
    })

    it('unauthenticated gets 401', async () => {
      const res = await fetch(url('/api/admin/skills'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', prompt: 'Prompt' })
      })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/admin/skills', () => {
    it('admin gets all skills ordered by position', async () => {
      const skills = await $fetch('/api/admin/skills', {
        headers: admin.headers
      }) as any[]

      expect(skills.length).toBeGreaterThanOrEqual(1)
      expect(skills[0]).toHaveProperty('id')
      expect(skills[0]).toHaveProperty('name')
      expect(skills[0]).toHaveProperty('prompt')
      expect(skills[0]).toHaveProperty('scope')
      expect(skills[0]).toHaveProperty('position')

      // Check ordering
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i].position).toBeGreaterThanOrEqual(skills[i - 1].position)
      }
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url('/api/admin/skills'), {
        headers: regularUser.headers
      })
      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/admin/skills/[id]', () => {
    it('admin can update name', async () => {
      const updated = await $fetch(`/api/admin/skills/${skillId}`, {
        method: 'PUT',
        body: { name: 'Updated Skill' },
        headers: admin.headers
      }) as any

      expect(updated.name).toBe('Updated Skill')
    })

    it('admin can update prompt', async () => {
      const updated = await $fetch(`/api/admin/skills/${skillId}`, {
        method: 'PUT',
        body: { prompt: 'New prompt for {title}' },
        headers: admin.headers
      }) as any

      expect(updated.prompt).toBe('New prompt for {title}')
    })

    it('admin can update scope', async () => {
      const updated = await $fetch(`/api/admin/skills/${skillId}`, {
        method: 'PUT',
        body: { scope: 'board' },
        headers: admin.headers
      }) as any

      expect(updated.scope).toBe('board')

      // Restore to card for other tests
      await $fetch(`/api/admin/skills/${skillId}`, {
        method: 'PUT',
        body: { scope: 'card' },
        headers: admin.headers
      })
    })

    it('rejects empty name', async () => {
      const res = await fetch(url(`/api/admin/skills/${skillId}`), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' })
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid scope', async () => {
      const res = await fetch(url(`/api/admin/skills/${skillId}`), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'nope' })
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent skill', async () => {
      const res = await fetch(url('/api/admin/skills/non-existent-id'), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' })
      })
      expect(res.status).toBe(404)
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url(`/api/admin/skills/${skillId}`), {
        method: 'PUT',
        headers: { ...regularUser.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' })
      })
      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/admin/skills/reorder', () => {
    it('admin can reorder skills', async () => {
      // Create two more skills for reordering
      const s1 = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: 'Reorder A', prompt: 'A' },
        headers: admin.headers
      }) as any
      const s2 = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: 'Reorder B', prompt: 'B' },
        headers: admin.headers
      }) as any

      const result = await $fetch('/api/admin/skills/reorder', {
        method: 'PUT',
        body: {
          skills: [
            { id: s2.id, position: 0 },
            { id: s1.id, position: 1 }
          ]
        },
        headers: admin.headers
      }) as any

      expect(result.ok).toBe(true)

      // Verify new order
      const skills = await $fetch('/api/admin/skills', { headers: admin.headers }) as any[]
      const s2Pos = skills.find((s: any) => s.id === s2.id)?.position
      const s1Pos = skills.find((s: any) => s.id === s1.id)?.position
      expect(s2Pos).toBeLessThan(s1Pos)
    })

    it('rejects empty array', async () => {
      const res = await fetch(url('/api/admin/skills/reorder'), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [] })
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing position', async () => {
      const res = await fetch(url('/api/admin/skills/reorder'), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [{ id: 'x' }] })
      })
      expect(res.status).toBe(400)
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url('/api/admin/skills/reorder'), {
        method: 'PUT',
        headers: { ...regularUser.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [{ id: 'x', position: 0 }] })
      })
      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/admin/skills/[id]', () => {
    it('admin can delete a skill', async () => {
      const toDelete = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: 'To Delete', prompt: 'Delete me' },
        headers: admin.headers
      }) as any

      const result = await $fetch(`/api/admin/skills/${toDelete.id}`, {
        method: 'DELETE',
        headers: admin.headers
      }) as any

      expect(result.ok).toBe(true)

      // Verify deleted
      const res = await fetch(url(`/api/admin/skills/${toDelete.id}`), {
        method: 'PUT',
        headers: { ...admin.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Should 404' })
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 for non-existent skill', async () => {
      const res = await fetch(url('/api/admin/skills/non-existent-id'), {
        method: 'DELETE',
        headers: admin.headers
      })
      expect(res.status).toBe(404)
    })

    it('non-admin gets 403', async () => {
      const res = await fetch(url(`/api/admin/skills/${skillId}`), {
        method: 'DELETE',
        headers: regularUser.headers
      })
      expect(res.status).toBe(403)
    })
  })
})

describe('GET /api/skills (public)', () => {
  let admin: TestUser
  let regularUser: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
  })

  it('authenticated user gets skills list', async () => {
    const skills = await $fetch('/api/skills', {
      headers: regularUser.headers
    }) as any[]

    expect(Array.isArray(skills)).toBe(true)
    if (skills.length > 0) {
      expect(skills[0]).toHaveProperty('id')
      expect(skills[0]).toHaveProperty('name')
      expect(skills[0]).toHaveProperty('scope')
      // Should NOT include prompt (public endpoint only returns id, name, scope, position)
      expect(skills[0]).not.toHaveProperty('prompt')
    }
  })

  it('can filter by scope', async () => {
    // Ensure we have a card skill
    await $fetch('/api/admin/skills', {
      method: 'POST',
      body: { name: 'Card Skill Filter', prompt: 'Test', scope: 'card' },
      headers: admin.headers
    })

    const cardSkills = await $fetch('/api/skills?scope=card', {
      headers: regularUser.headers
    }) as any[]

    expect(Array.isArray(cardSkills)).toBe(true)
    for (const s of cardSkills) {
      expect(s.scope).toBe('card')
    }
  })

  it('rejects invalid scope', async () => {
    const res = await fetch(url('/api/skills?scope=invalid'), {
      headers: regularUser.headers
    })
    expect(res.status).toBe(400)
  })

  it('unauthenticated gets 401', async () => {
    const res = await fetch(url('/api/skills'))
    expect(res.status).toBe(401)
  })
})
