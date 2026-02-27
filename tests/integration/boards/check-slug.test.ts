import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard } from '../../setup/fixtures'

describe('GET /api/boards/check-slug', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('returns available: true for unused slug within a project', async () => {
    const project = await createTestProject(user, { name: `Board Slug Check ${Date.now()}` })

    const result = await $fetch(`/api/boards/check-slug?slug=unused-slug&projectId=${project.id}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('returns available: false for taken slug within same project', async () => {
    const project = await createTestProject(user, { name: `Board Slug Taken ${Date.now()}` })
    const board = await createTestBoard(user, project.id, { name: 'Taken Board' })

    const result = await $fetch(`/api/boards/check-slug?slug=${board.slug}&projectId=${project.id}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(false)
  })

  it('allows same slug in different projects', async () => {
    const project1 = await createTestProject(user, { name: `Slug Proj 1 ${Date.now()}` })
    const project2 = await createTestProject(user, { name: `Slug Proj 2 ${Date.now()}` })

    await createTestBoard(user, project1.id, { slug: 'shared-slug' })

    const result = await $fetch(`/api/boards/check-slug?slug=shared-slug&projectId=${project2.id}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('excludes a board ID from the check', async () => {
    const project = await createTestProject(user, { name: `Board Exclude ${Date.now()}` })
    const board = await createTestBoard(user, project.id, { name: 'Exclude Board' })

    const result = await $fetch(`/api/boards/check-slug?slug=${board.slug}&projectId=${project.id}&exclude=${board.id}`, {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(true)
  })

  it('returns available: false when missing required params', async () => {
    const result = await $fetch('/api/boards/check-slug?slug=test', {
      headers: user.headers
    }) as { available: boolean }

    expect(result.available).toBe(false)
  })
})
