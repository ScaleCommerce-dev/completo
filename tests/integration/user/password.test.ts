import { describe, it, expect } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createTestToken } from '../../setup/auth'

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
