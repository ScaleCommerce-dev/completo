import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'

/**
 * Deleting a status does not delete cards.
 *
 * `cards.statusId` cascades in the schema, so the naive handler — one `db.delete`
 * on the status — silently took every card in it. The cascade is still there and
 * still has to be (a project's cards are reached through `projectId` *and*
 * `statusId`, and SQLite orders neither), which is exactly why these assertions
 * count cards after the fact rather than reading the handler: the guard lives in
 * one place and the FK would happily do the old thing if it ever stopped running.
 */

interface Status { id: string, name: string, cardCount: number }
interface Card { id: number, statusId: string, position: number }
interface DeleteResult { ok: boolean, movedCards: number, movedToStatusId: string | null }

async function statusesOf(user: TestUser, projectId: string): Promise<Status[]> {
  const project = await $fetch(`/api/projects/${projectId}`, { headers: user.headers }) as { statuses: Status[] }
  return project.statuses
}

async function cardsOf(user: TestUser, projectId: string): Promise<Card[]> {
  return await $fetch(`/api/projects/${projectId}/cards`, { headers: user.headers }) as Card[]
}

async function named(user: TestUser, projectId: string, name: string): Promise<Status> {
  const status = (await statusesOf(user, projectId)).find(s => s.name === name)
  if (!status) throw new Error(`no status named ${name}`)
  return status
}

async function deleteStatus(user: TestUser, id: string, body?: { moveToStatusId?: string }): Promise<DeleteResult> {
  return await $fetch(`/api/statuses/${id}`, { method: 'DELETE', body, headers: user.headers }) as DeleteResult
}

describe('DELETE /api/statuses/:id', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('deletes an empty status, and its board columns with it', async () => {
    const project = await createTestProject(user, { name: `Status Delete Empty ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const backlog = await named(user, project.id, 'Backlog')

    const result = await deleteStatus(user, backlog.id)
    expect(result.movedCards).toBe(0)

    expect((await statusesOf(user, project.id)).map(s => s.name)).not.toContain('Backlog')
    // A column for a status that no longer exists is not a view of anything.
    const columns = (await getBoard(user, board.id)).columns as Array<{ name: string }>
    expect(columns.map(c => c.name)).not.toContain('Backlog')
  })

  it('refuses a status holding cards, says how many, and changes nothing', async () => {
    const project = await createTestProject(user, { name: `Status Delete Refuse ${Date.now()}` })
    await createTestBoard(user, project.id)
    const backlog = await named(user, project.id, 'Backlog')
    const first = await createTestCard(user, project.id, backlog.id, { title: 'Keep me' })
    const second = await createTestCard(user, project.id, backlog.id, { title: 'Keep me too' })

    // Native fetch: the shared $fetch throws on a non-2xx and the count in the
    // body is the thing under test.
    const res = await fetch(url(`/api/statuses/${backlog.id}`), { method: 'DELETE', headers: user.headers })
    expect(res.status).toBe(409)
    expect((await res.json()).data).toEqual({ cardCount: 2 })

    expect((await statusesOf(user, project.id)).map(s => s.id)).toContain(backlog.id)
    const after = await cardsOf(user, project.id)
    expect(after.map(c => c.id).sort()).toEqual([first.id, second.id].sort())
    expect(after.every(c => c.statusId === backlog.id)).toBe(true)
  })

  it('moves the cards to the destination, then deletes the status', async () => {
    const project = await createTestProject(user, { name: `Status Delete Move ${Date.now()}` })
    await createTestBoard(user, project.id)
    const backlog = await named(user, project.id, 'Backlog')
    const todo = await named(user, project.id, 'To Do')

    // Two already in the destination, so "appended after" is checkable rather than
    // trivially true.
    const staying = [
      await createTestCard(user, project.id, todo.id, { title: 'Already here' }),
      await createTestCard(user, project.id, todo.id, { title: 'Also already here' })
    ]
    const moving = [
      await createTestCard(user, project.id, backlog.id, { title: 'Moves first' }),
      await createTestCard(user, project.id, backlog.id, { title: 'Moves second' })
    ]

    const result = await deleteStatus(user, backlog.id, { moveToStatusId: todo.id })
    expect(result).toMatchObject({ ok: true, movedCards: 2, movedToStatusId: todo.id })

    expect((await statusesOf(user, project.id)).map(s => s.id)).not.toContain(backlog.id)

    const after = await cardsOf(user, project.id)
    expect(after, 'no card was lost').toHaveLength(4)
    expect(after.map(c => c.id).sort(), 'and none was recreated under a new id')
      .toEqual([...staying, ...moving].map(c => c.id).sort())
    expect(after.every(c => c.statusId === todo.id)).toBe(true)

    const position = new Map(after.map(c => [c.id, c.position]))
    expect(new Set(position.values()).size, 'four cards, four distinct positions').toBe(4)
    expect(
      Math.min(...moving.map(c => position.get(c.id)!)),
      'the moved cards land after the ones already there'
    ).toBeGreaterThan(Math.max(...staying.map(c => position.get(c.id)!)))
    expect(
      position.get(moving[0]!.id)!,
      'and keep their order among themselves'
    ).toBeLessThan(position.get(moving[1]!.id)!)
  })

  it('takes the destination as a query parameter, which is what the spec documents', async () => {
    const project = await createTestProject(user, { name: `Status Delete Query ${Date.now()}` })
    await createTestBoard(user, project.id)
    const backlog = await named(user, project.id, 'Backlog')
    const todo = await named(user, project.id, 'To Do')
    const card = await createTestCard(user, project.id, backlog.id, { title: 'Moved by query' })

    await deleteStatus(user, `${backlog.id}?moveToStatusId=${todo.id}`)

    const after = await cardsOf(user, project.id)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: card.id, statusId: todo.id })
  })

  it('rejects a destination outside the project, or the status itself', async () => {
    const project = await createTestProject(user, { name: `Status Delete Target ${Date.now()}` })
    const elsewhere = await createTestProject(user, { name: `Status Delete Elsewhere ${Date.now()}` })
    await createTestBoard(user, project.id)
    const backlog = await named(user, project.id, 'Backlog')
    const foreign = await named(user, elsewhere.id, 'To Do')
    const card = await createTestCard(user, project.id, backlog.id, { title: 'Stays put' })

    await expectError(deleteStatus(user, backlog.id, { moveToStatusId: foreign.id }), 400)
    await expectError(deleteStatus(user, backlog.id, { moveToStatusId: backlog.id }), 400)

    const after = await cardsOf(user, project.id)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: card.id, statusId: backlog.id })
    // And nothing was moved into the other project on the way.
    expect(await cardsOf(user, elsewhere.id)).toHaveLength(0)
  })

  it('keeps the last status, because a card cannot be created without one', async () => {
    const project = await createTestProject(user, { name: `Status Delete Last ${Date.now()}` })
    const all = await statusesOf(user, project.id)
    expect(all.length).toBeGreaterThan(1)

    for (const status of all.slice(1)) await deleteStatus(user, status.id)

    const survivor = (await statusesOf(user, project.id))[0]!
    await expectError(deleteStatus(user, survivor.id), 409)
    expect((await statusesOf(user, project.id)).map(s => s.id)).toEqual([survivor.id])
  })
})
