import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('POST /api/projects', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates a project with auto-generated key and slug', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const w1 = `${chars[Math.floor(Math.random() * 26)]}alpha`
    const w2 = `${chars[Math.floor(Math.random() * 26)]}beta`
    const w3 = `${chars[Math.floor(Math.random() * 26)]}gamma`
    const unique = `${w1} ${w2} ${w3}`
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: unique },
      headers: user.headers
    }) as Record<string, unknown>

    expect(project.name).toBe(unique)
    expect(project.key).toMatch(/^[A-Z]{1,5}$/)
    expect(project.slug).toBeTruthy()
    expect(project.id).toBeTruthy()
  })

  it('uses provided key and slug', async () => {
    const slug = `custom-slug-${Date.now()}`
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const key = `C${chars[Math.floor(Math.random() * 26)]}${chars[Math.floor(Math.random() * 26)]}${chars[Math.floor(Math.random() * 26)]}`
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: 'Custom Project', key, slug },
      headers: user.headers
    }) as Record<string, unknown>

    expect(project.key).toBe(key)
    expect(project.slug).toBe(slug)
  })

  it('makes the creator an owner', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const key = `O${chars[Math.floor(Math.random() * 26)]}${chars[Math.floor(Math.random() * 26)]}`
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: `Owner Test ${Date.now()}`, key },
      headers: user.headers
    }) as Record<string, unknown>

    const members = await $fetch(`/api/projects/${project.id}/members`, {
      headers: user.headers
    }) as Record<string, unknown>[]

    const owner = members.find((m: Record<string, unknown>) => m.id === user.id)
    expect(owner).toBeTruthy()
    expect(owner!.role).toBe('owner')
  })

  it('rejects invalid key format', async () => {
    await expectError($fetch('/api/projects', {
      method: 'POST',
      body: { name: 'Bad Key', key: 'abc' },
      headers: user.headers
    }), 400)
  })

  it('rejects duplicate key', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const key = `D${chars[Math.floor(Math.random() * 26)]}${chars[Math.floor(Math.random() * 26)]}${chars[Math.floor(Math.random() * 26)]}`
    await $fetch('/api/projects', {
      method: 'POST',
      body: { name: `First Dup ${Date.now()}`, key },
      headers: user.headers
    })

    await expectError($fetch('/api/projects', {
      method: 'POST',
      body: { name: `Second Dup ${Date.now()}`, key },
      headers: user.headers
    }), 409)
  })

  it('rejects missing name', async () => {
    await expectError($fetch('/api/projects', {
      method: 'POST',
      body: {},
      headers: user.headers
    }), 400)
  })

  it('rejects unauthenticated requests', async () => {
    await expectError($fetch('/api/projects', {
      method: 'POST',
      body: { name: 'Unauth Project' }
    }), 401)
  })

  it('auto-sets doneStatusId to the Done status', async () => {
    const project = await createTestProject(user, { name: `Done Col ${Date.now()}` })
    const detail = await $fetch(`/api/projects/${project.id}`, {
      headers: user.headers
    }) as Record<string, unknown>

    expect(detail.doneStatusId).toBeTruthy()
    const doneStatus = detail.statuses.find((c: Record<string, unknown>) => c.id === detail.doneStatusId)
    expect(doneStatus).toBeTruthy()
    expect(doneStatus.name).toBe('Done')
  })

  it('accepts doneRetentionDays on creation', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const key = `R${chars[Math.floor(Math.random() * 26)]}${chars[Math.floor(Math.random() * 26)]}`
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: `Retention ${Date.now()}`, key, doneRetentionDays: 14 },
      headers: user.headers
    }) as Record<string, unknown>

    expect(project.doneRetentionDays).toBe(14)
  })
})
