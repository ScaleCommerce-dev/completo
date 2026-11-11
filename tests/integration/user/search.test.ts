import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'

const search = (user: TestUser, q: string) =>
  $fetch('/api/users/search', { query: { q }, headers: user.headers }) as Promise<Array<{ id: string, name: string }>>

/**
 * `%` and `_` are LIKE wildcards and `\` is the declared escape, so all three
 * have to match only themselves: a name with an underscore in it has to be
 * findable by typing that underscore, and must not also match every name with
 * any character in that place.
 */
describe('GET /api/users/search', () => {
  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  let caller: TestUser
  let underscore: TestUser
  let percent: TestUser
  let backslash: TestUser
  let decoy: TestUser

  beforeAll(async () => {
    caller = await registerTestUser()
    underscore = await registerTestUser({ name: `Ada_${s}` })
    percent = await registerTestUser({ name: `Fifty%${s}` })
    backslash = await registerTestUser({ name: `Back\\slash${s}` })
    decoy = await registerTestUser({ name: `AdaX${s} Fifty${s}` })
  })

  it('finds a name by the underscore in it, and only that name', async () => {
    expect((await search(caller, `a_${s}`)).map(u => u.id)).toEqual([underscore.id])
  })

  it('finds a name by the percent sign in it, and only that name', async () => {
    expect((await search(caller, `y%${s}`)).map(u => u.id)).toEqual([percent.id])
  })

  it('finds a name by the backslash in it', async () => {
    expect((await search(caller, `k\\s`)).map(u => u.id)).toContain(backslash.id)
  })

  it('still matches a plain substring', async () => {
    expect((await search(caller, `AdaX${s}`)).map(u => u.id)).toEqual([decoy.id])
  })
})
