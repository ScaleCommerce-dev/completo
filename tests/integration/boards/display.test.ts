import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard } from '../../setup/fixtures'

/**
 * `boards.show_description` decides whether board cards carry a description
 * excerpt. It is stored 0/1 like the rest of the schema's booleans, so the two
 * things worth pinning down are that it survives the round trip as a *boolean*
 * (a client binding a switch to `1` is a bug waiting to happen) and that it
 * defaults to on — a board created before the column existed must not silently
 * lose the excerpt.
 */
describe('board display settings', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  async function freshBoard() {
    const project = await createTestProject(user, { name: `Display ${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
    return await createTestBoard(user, project.id)
  }

  it('defaults showDescription to true', async () => {
    const board = await freshBoard()
    const result = await getBoard(user, board.id)

    expect(result.showDescription).toBe(true)
  })

  it('persists showDescription: false', async () => {
    const board = await freshBoard()

    const updated = await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { showDescription: false },
      headers: user.headers
    }) as { showDescription: boolean }

    expect(updated.showDescription).toBe(false)
    expect((await getBoard(user, board.id)).showDescription).toBe(false)
  })

  it('turns showDescription back on', async () => {
    const board = await freshBoard()

    await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { showDescription: false },
      headers: user.headers
    })
    await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { showDescription: true },
      headers: user.headers
    })

    expect((await getBoard(user, board.id)).showDescription).toBe(true)
  })

  it('leaves showDescription alone when the body only carries a rename', async () => {
    const board = await freshBoard()

    await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { showDescription: false },
      headers: user.headers
    })
    await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { name: `Renamed ${Date.now()}` },
      headers: user.headers
    })

    expect((await getBoard(user, board.id)).showDescription).toBe(false)
  })

  it('accepts showDescription as the only field in the body', async () => {
    // The endpoint rejects an empty update; `showDescription` alone must count
    // as a real one rather than falling through to the 400.
    const board = await freshBoard()

    const updated = await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { showDescription: false },
      headers: user.headers
    }) as { showDescription: boolean }

    expect(updated.showDescription).toBe(false)
  })

  it('still rejects a body with nothing in it', async () => {
    const board = await freshBoard()

    await expectError(
      $fetch(`/api/boards/${board.id}`, {
        method: 'PUT',
        body: {},
        headers: user.headers
      }),
      400
    )
  })

  it('is not writable by a non-member', async () => {
    const board = await freshBoard()
    const outsider = await registerTestUser()

    await expectError(
      $fetch(`/api/boards/${board.id}`, {
        method: 'PUT',
        body: { showDescription: false },
        headers: outsider.headers
      }),
      404
    )
  })
})
