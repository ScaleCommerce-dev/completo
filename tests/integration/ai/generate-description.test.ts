import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'

describe('POST /api/projects/[id]/ai/generate-description', () => {
  let user: TestUser
  let projectId: string

  beforeAll(async () => {
    user = await registerTestUser()
    const project = await createTestProject(user)
    projectId = project.id
  })

  it('rejects unauthenticated requests', async () => {
    const res = await fetch(url(`/api/projects/${projectId}/ai/generate-description`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test card' })
    })

    expect(res.status).toBe(401)
  })

  it('rejects non-member requests', async () => {
    const otherUser = await registerTestUser()
    const res = await fetch(url(`/api/projects/${projectId}/ai/generate-description`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...otherUser.headers
      },
      body: JSON.stringify({ title: 'Test card' })
    })

    // resolveProject returns 404 for non-members (don't leak resource existence)
    expect(res.status).toBe(404)
  })

  it('rejects missing title', async () => {
    await expectError($fetch(`/api/projects/${projectId}/ai/generate-description`, {
      method: 'POST',
      body: {},
      headers: user.headers
    }), 400)
  })

  it('rejects empty title', async () => {
    await expectError($fetch(`/api/projects/${projectId}/ai/generate-description`, {
      method: 'POST',
      body: { title: '   ' },
      headers: user.headers
    }), 400)
  })

  it('rejects invalid mode', async () => {
    await expectError($fetch(`/api/projects/${projectId}/ai/generate-description`, {
      method: 'POST',
      body: { title: 'Test card', mode: 'invalid' },
      headers: user.headers
    }), 400)
  })

  it('rejects nonexistent skillId', async () => {
    const res = await fetch(url(`/api/projects/${projectId}/ai/generate-description`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...user.headers
      },
      body: JSON.stringify({
        title: 'Test card',
        skillId: 'nonexistent-skill-id'
      })
    })

    expect(res.status).toBe(404)
  })

  // NOTE: No tests that reach streamAiResponse — AI calls cost money
  // and hitting providers without keys may get us blocked.
  // Tests for generate/improve/userPrompt modes are skipped intentionally.
})
