import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('Project briefing field', () => {
  let user: TestUser

  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates project with briefing', async () => {
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: {
        name: `Briefing Test ${Date.now()}`,
        briefing: '# Project Context\nThis is a web app for managing tasks.'
      },
      headers: user.headers
    }) as Record<string, unknown>

    expect(project.briefing).toBe('# Project Context\nThis is a web app for managing tasks.')
  })

  it('creates project without briefing (null)', async () => {
    const project = await createTestProject(user)
    expect(project).toBeTruthy()
    const detail = await $fetch(`/api/projects/${project.id}`, {
      headers: user.headers
    }) as Record<string, unknown>
    expect(detail.briefing).toBeNull()
  })

  it('updates briefing via PUT', async () => {
    const project = await createTestProject(user)

    const updated = await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { briefing: 'Updated briefing content' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(updated.briefing).toBe('Updated briefing content')
  })

  it('clears briefing by setting to empty string', async () => {
    const project = await createTestProject(user)

    await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { briefing: 'Some content' },
      headers: user.headers
    })

    const updated = await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { briefing: '' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(updated.briefing).toBeNull()
  })

  it('returns briefing in project detail', async () => {
    const project = await createTestProject(user)

    await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { briefing: '## Tech Stack\nNuxt 4 + SQLite' },
      headers: user.headers
    })

    const detail = await $fetch(`/api/projects/${project.id}`, {
      headers: user.headers
    }) as Record<string, unknown>

    expect(detail.briefing).toBe('## Tech Stack\nNuxt 4 + SQLite')
  })
})
