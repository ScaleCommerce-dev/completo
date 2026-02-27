import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('GET /api/projects/check-key', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('returns available: true for unused key', async () => {
    const result = await $fetch('/api/projects/check-key?key=ZZZZ', {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('returns available: false for taken key', async () => {
    const project = await createTestProject(user, { name: `Key Check ${Date.now()}` })
    const result = await $fetch(`/api/projects/check-key?key=${project.key}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(false)
  })

  it('excludes a project ID from the check', async () => {
    const project = await createTestProject(user, { name: `Key Exclude ${Date.now()}` })

    const result = await $fetch(`/api/projects/check-key?key=${project.key}&exclude=${project.id}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('returns available: false for empty key', async () => {
    const result = await $fetch('/api/projects/check-key?key=', {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(false)
  })
})
