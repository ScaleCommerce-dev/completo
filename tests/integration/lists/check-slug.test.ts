import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestList } from '../../setup/fixtures'

describe('GET /api/lists/check-slug', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('returns available for unused slug', async () => {
    const project = await createTestProject(user, { name: `Slug Check ${Date.now()}` })
    const result = await $fetch('/api/lists/check-slug', {
      params: { slug: 'fresh-slug', projectId: project.id },
      headers: user.headers
    }) as any

    expect(result.available).toBe(true)
  })

  it('returns unavailable for taken slug', async () => {
    const project = await createTestProject(user, { name: `Slug Taken ${Date.now()}` })
    await createTestList(user, project.id, { slug: 'taken' })

    const result = await $fetch('/api/lists/check-slug', {
      params: { slug: 'taken', projectId: project.id },
      headers: user.headers
    }) as any

    expect(result.available).toBe(false)
  })

  it('excludes specified list from check', async () => {
    const project = await createTestProject(user, { name: `Slug Exclude ${Date.now()}` })
    const list = await createTestList(user, project.id, { slug: 'my-slug' })

    const result = await $fetch('/api/lists/check-slug', {
      params: { slug: 'my-slug', projectId: project.id, exclude: list.id },
      headers: user.headers
    }) as any

    expect(result.available).toBe(true)
  })

  it('returns unavailable for empty slug', async () => {
    const project = await createTestProject(user, { name: `Slug Empty ${Date.now()}` })
    const result = await $fetch('/api/lists/check-slug', {
      params: { slug: '', projectId: project.id },
      headers: user.headers
    }) as any

    expect(result.available).toBe(false)
  })
})
