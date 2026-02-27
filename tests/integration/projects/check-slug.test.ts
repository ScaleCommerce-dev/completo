import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('GET /api/projects/check-slug', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('returns available: true for unused slug', async () => {
    const result = await $fetch(`/api/projects/check-slug?slug=totally-unique-${Date.now()}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('returns available: false for taken slug', async () => {
    const project = await createTestProject(user, { name: `Slug Check ${Date.now()}` })
    const result = await $fetch(`/api/projects/check-slug?slug=${project.slug}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(false)
  })

  it('excludes a project ID from the check', async () => {
    const project = await createTestProject(user, { name: `Slug Exclude ${Date.now()}` })

    const result = await $fetch(`/api/projects/check-slug?slug=${project.slug}&exclude=${project.id}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('returns available: false for empty slug', async () => {
    const result = await $fetch('/api/projects/check-slug?slug=', {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(false)
  })
})
