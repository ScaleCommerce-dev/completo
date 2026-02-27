import { url, $fetch } from './server'

let counter = 0

/**
 * Create an API token for a test user and return the raw token + headers for authenticated requests.
 */
export async function createTestToken(user: TestUser, overrides?: { name?: string, expiresInDays?: number }): Promise<{ token: string, id: string, headers: Record<string, string> }> {
  const result = await $fetch('/api/user/tokens', {
    method: 'POST',
    body: {
      name: overrides?.name || `Test Token ${Date.now()}`,
      expiresInDays: overrides?.expiresInDays
    },
    headers: user.headers
  }) as { id: string, token: string }

  return {
    token: result.token,
    id: result.id,
    headers: { authorization: `Bearer ${result.token}` }
  }
}

/**
 * Build Bearer token headers from a raw token string.
 */
export function tokenHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

export interface TestUser {
  id: string
  email: string
  name: string
  cookie: string
  headers: Record<string, string>
  isAdmin?: boolean
}

/**
 * Register a unique test user, auto-verify email, and return their session cookie + headers.
 */
export async function registerTestUser(overrides?: { name?: string, email?: string, password?: string }): Promise<TestUser> {
  counter++
  const name = overrides?.name || `Test User ${counter}`
  const email = overrides?.email || `test${counter}-${Date.now()}@example.com`
  const password = overrides?.password || 'testpass123'

  // Register (no longer sets session)
  const regResponse = await fetch(url('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  })

  if (!regResponse.ok) {
    throw new Error(`Registration failed: ${regResponse.status} ${await regResponse.text()}`)
  }

  const regBody = await regResponse.json() as { user: { id: string, email: string } }

  // Auto-verify via test endpoint
  const verifyResponse = await fetch(url('/api/_test/verify-email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: regBody.user.id })
  })
  if (!verifyResponse.ok) {
    throw new Error(`Verification failed: ${verifyResponse.status} ${await verifyResponse.text()}`)
  }

  // Login to get session cookie
  const loginResponse = await fetch(url('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  if (!loginResponse.ok) {
    throw new Error(`Login after registration failed: ${loginResponse.status} ${await loginResponse.text()}`)
  }

  const setCookie = loginResponse.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]

  const loginBody = await loginResponse.json() as { user: { id: string, email: string, name: string } }

  return {
    id: loginBody.user.id,
    email: loginBody.user.email,
    name: loginBody.user.name,
    cookie,
    headers: { cookie }
  }
}

/**
 * Create an admin user: register, verify, promote via test endpoint, re-login to get admin session.
 */
export async function createAdminUser(): Promise<TestUser> {
  counter++
  const name = `Admin User ${counter}`
  const email = `admin${counter}-${Date.now()}@example.com`
  const password = 'testpass123'

  const user = await registerTestUser({ name, email, password })

  // Promote to admin
  await $fetch('/api/_test/promote-admin', {
    method: 'POST',
    body: { userId: user.id },
    headers: user.headers
  })

  // Re-login to get session with isAdmin: true
  const loginResponse = await fetch(url('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  if (!loginResponse.ok) {
    throw new Error(`Admin re-login failed: ${loginResponse.status} ${await loginResponse.text()}`)
  }

  const setCookie = loginResponse.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    cookie,
    headers: { cookie },
    isAdmin: true
  }
}
