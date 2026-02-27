import { describe, it, expect } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser } from '../../setup/auth'

describe('PUT /api/user/password', async () => {
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
