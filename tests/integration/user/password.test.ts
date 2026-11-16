import { describe, it, expect } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createTestToken, createAdminUser } from '../../setup/auth'
import { createTestAgent, createAgentToken, setCanCreateAgents } from '../../setup/agents'

describe('PUT /api/user/password', async () => {
  it('revokes API tokens, which a past holder of the password could have minted', async () => {
    const user = await registerTestUser({ password: 'oldpass123' })
    const token = await createTestToken(user)
    expect((await fetch(url('/api/projects'), { headers: token.headers })).status).toBe(200)

    const result = await $fetch<{ revokedTokens: number }>('/api/user/password', {
      method: 'PUT',
      body: { currentPassword: 'oldpass123', newPassword: 'newpass456' },
      headers: user.headers
    })

    expect(result.revokedTokens).toBe(1)
    expect((await fetch(url('/api/projects'), { headers: token.headers })).status).toBe(401)
  })

  it('revokes the tokens of the agents this person manages, and keeps the agents', async () => {
    // As a reset does: whoever knew the password (or held a leaked API token, which
    // may manage agents) could mint an agent token that outlived the change.
    const admin = await createAdminUser()
    const user = await registerTestUser({ password: 'oldpass123' })
    await setCanCreateAgents(admin, user, true)
    const agent = await createTestAgent(user)
    const agentToken = await createAgentToken(user, agent.id)
    expect((await fetch(url('/api/projects'), { headers: agentToken.headers })).status).toBe(200)

    const result = await $fetch<{ revokedAgentTokens: number }>('/api/user/password', {
      method: 'PUT',
      body: { currentPassword: 'oldpass123', newPassword: 'newpass456' },
      headers: user.headers
    })

    expect(result.revokedAgentTokens).toBe(1)
    expect((await fetch(url('/api/projects'), { headers: agentToken.headers })).status).toBe(401)
    // The agent itself stays (the change ended the user's other sessions, so ask an admin).
    const all = await $fetch<Array<{ id: string }>>('/api/agents', { query: { scope: 'all' }, headers: admin.headers })
    expect(all.map(a => a.id)).toContain(agent.id)
  })

  it('changes password successfully', async () => {
    const user = await registerTestUser({ password: 'oldpass123' })

    const result = await $fetch('/api/user/password', {
      method: 'PUT',
      body: { currentPassword: 'oldpass123', newPassword: 'newpass456' },
      headers: user.headers
    }) as Record<string, unknown>

    expect(result.ok).toBe(true)

    // Verify login with new password works
    const loginRes = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'newpass456' })
    })
    expect(loginRes.status).toBe(200)
  })

  it('rejects wrong current password', async () => {
    const user = await registerTestUser({ password: 'correct123' })

    await expectError($fetch('/api/user/password', {
      method: 'PUT',
      body: { currentPassword: 'wrongpassword', newPassword: 'newpass456' },
      headers: user.headers
    }), 401)
  })

  it('rejects short new password', async () => {
    const user = await registerTestUser({ password: 'mypass123' })

    await expectError($fetch('/api/user/password', {
      method: 'PUT',
      body: { currentPassword: 'mypass123', newPassword: '12345' },
      headers: user.headers
    }), 400)
  })

  it('rejects missing fields', async () => {
    const user = await registerTestUser()

    await expectError($fetch('/api/user/password', {
      method: 'PUT',
      body: { currentPassword: 'something' },
      headers: user.headers
    }), 400)
  })
})
