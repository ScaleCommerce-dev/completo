import { describe, it, expect, beforeAll } from 'vitest'
import { url } from '../../setup/server'
import { createAdminUser, registerTestUser, type TestUser } from '../../setup/auth'
import { setCanCreateAgents } from '../../setup/agents'

/**
 * `canManageAgents` on the session the client reads, which is what shows the
 * Agents page in the sidebar and lets the route guard through. It has to follow
 * the permission as an admin changes it, without a fresh sign-in: the cookie is
 * sealed at login, so a value stored there would be stale for the rest of the
 * session. `server/plugins/session-capabilities.ts` reads it on every fetch.
 */
async function sessionUser(user: TestUser) {
  const res = await fetch(url('/api/_auth/session'), { headers: { cookie: user.cookie } })
  const body = await res.json() as { user?: { id: string, canManageAgents?: boolean } }
  return body.user
}

describe('Agents: the session says who may manage them', () => {
  let admin: TestUser
  let person: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    person = await registerTestUser()
  })

  it('is true for an admin', async () => {
    expect((await sessionUser(admin))?.canManageAgents).toBe(true)
  })

  it('is false for a person without the permission', async () => {
    expect((await sessionUser(person))?.canManageAgents).toBe(false)
  })

  it('follows the permission as an admin grants and revokes it, in the same session', async () => {
    await setCanCreateAgents(admin, person, true)
    expect((await sessionUser(person))?.canManageAgents).toBe(true)

    await setCanCreateAgents(admin, person, false)
    expect((await sessionUser(person))?.canManageAgents).toBe(false)
  })
})
