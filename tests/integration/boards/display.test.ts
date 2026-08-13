import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard } from '../../setup/fixtures'

/**
 * `boards.hidden_card_fields` decides what a board's cards paint at rest. It
 * stores the fields that are *off* — see `shared/utils/card-fields.ts` — so the
 * things worth pinning down are that a fresh board hides nothing, that an
 * unknown key never survives the round trip, and that "hide nothing" persists as
 * `null` rather than an empty array, since those must stay the same row.
 *
 * It replaced a boolean column per field. That shape meant a migration for every
 * new card element, and it hid each new one from every board that predated it.
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

  function put(boardId: string, hiddenCardFields: string[], headers = user.headers) {
    return $fetch(`/api/boards/${boardId}`, {
      method: 'PUT',
      body: { hiddenCardFields },
      headers
    }) as Promise<{ hiddenCardFields: string[] }>
  }

  it('hides nothing on a new board', async () => {
    const board = await freshBoard()

    expect((await getBoard(user, board.id)).hiddenCardFields).toEqual([])
  })

  it('persists a hidden field', async () => {
    const board = await freshBoard()

    const updated = await put(board.id, ['tags'])

    expect(updated.hiddenCardFields).toEqual(['tags'])
    expect((await getBoard(user, board.id)).hiddenCardFields).toEqual(['tags'])
  })

  it('turns a field back on', async () => {
    const board = await freshBoard()

    await put(board.id, ['tags'])
    await put(board.id, [])

    expect((await getBoard(user, board.id)).hiddenCardFields).toEqual([])
  })

  it('holds several at once, sorted', async () => {
    const board = await freshBoard()

    const updated = await put(board.id, ['ticketId', 'assignee', 'priority'])

    expect(updated.hiddenCardFields).toEqual(['assignee', 'priority', 'ticketId'])
  })

  it('drops a field name it does not know', async () => {
    // A board configured by a newer release must not hand this one a key it will
    // then compare against the card face.
    const board = await freshBoard()

    const updated = await put(board.id, ['tags', 'somethingFromTheFuture'])

    expect(updated.hiddenCardFields).toEqual(['tags'])
    expect((await getBoard(user, board.id)).hiddenCardFields).toEqual(['tags'])
  })

  it('leaves the setting alone when the body only carries a rename', async () => {
    const board = await freshBoard()

    await put(board.id, ['tags'])
    await $fetch(`/api/boards/${board.id}`, {
      method: 'PUT',
      body: { name: `Renamed ${Date.now()}` },
      headers: user.headers
    })

    expect((await getBoard(user, board.id)).hiddenCardFields).toEqual(['tags'])
  })

  it('accepts hiddenCardFields as the only field in the body', async () => {
    // The endpoint rejects an empty update; this alone must count as a real one
    // rather than falling through to the 400.
    const board = await freshBoard()

    expect((await put(board.id, ['tags'])).hiddenCardFields).toEqual(['tags'])
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

    await expectError(put(board.id, ['tags'], outsider.headers), 404)
  })
})
