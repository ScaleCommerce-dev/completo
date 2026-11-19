import { describe, it, expect } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, createAdminUser } from '../../setup/auth'

/**
 * The client reads `isAdmin` from `/api/_auth/session`. The sealed cookie holds the
 * value from sign-in, so without the fetch hook in `server/plugins/session-capabilities.ts`
 * an admin granted later saw the app as a non-admin until they signed in again
 * (no "Add people" in projects they were not in, no star, no admin menu), and a
 * demoted admin kept the controls.
 */
async function sessionIsAdmin(headers: Record<string, string>) {
  const session = await $fetch('/api/_auth/session', { headers }) as { user?: { isAdmin?: boolean } }
  return session.user?.isAdmin
}

describe('isAdmin in the session the client reads', () => {
  it('follows a promotion and a demotion without signing in again', async () => {
    const admin = await createAdminUser()
    const user = await registerTestUser()
    expect(await sessionIsAdmin(user.headers)).toBe(false)

    await $fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { isAdmin: true }, headers: admin.headers })
    expect(await sessionIsAdmin(user.headers)).toBe(true)

    await $fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { isAdmin: false }, headers: admin.headers })
    expect(await sessionIsAdmin(user.headers)).toBe(false)
  })
})
