import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestList, getBoard, getList } from '../../setup/fixtures'

interface Status { id: string, name: string }
interface Detail {
  id: number
  parentId: number | null
  parent: { id: number, title: string, ticket: string } | null
  subtaskCards: Array<{ id: number, ticket: string }>
  subtasks: { total: number, done: number } | null
}

async function setup(user: TestUser) {
  const project = await createTestProject(user)
  const detail = await $fetch<{ statuses: Status[], doneStatusId: string }>(`/api/projects/${project.id}`, { headers: user.headers })
  const done = detail.doneStatusId
  const open = detail.statuses.find(s => s.id !== done)!.id
  return { project, done, open }
}

const getCard = (user: TestUser, id: number) => $fetch<Detail>(`/api/cards/${id}`, { headers: user.headers })
const put = (user: TestUser, id: number, body: Record<string, unknown>) =>
  $fetch(`/api/cards/${id}`, { method: 'PUT', body, headers: user.headers })
const createSub = (user: TestUser, projectId: string, statusId: string, parentId: number, title = 'Sub') =>
  $fetch<{ id: number, parentId: number }>(`/api/projects/${projectId}/cards`, { method: 'POST', body: { statusId, title, parentId }, headers: user.headers })

describe('sub-tasks', () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('creates a sub-task and shows it on both cards', async () => {
    const { project, open } = await setup(user)
    const parent = await createTestCard(user, project.id, open, { title: 'Parent' })
    const sub = await createSub(user, project.id, open, parent.id)
    expect(sub.parentId).toBe(parent.id)

    const p = await getCard(user, parent.id)
    expect(p.subtaskCards.map(c => c.id)).toEqual([sub.id])
    expect(p.subtaskCards[0]!.ticket).toBe(`${project.key}-${sub.id}`)
    expect(p.subtasks).toEqual({ total: 1, done: 0 })

    const s = await getCard(user, sub.id)
    expect(s.parent).toMatchObject({ id: parent.id, title: 'Parent', ticket: `${project.key}-${parent.id}` })
    expect(s.subtasks).toBeNull()
  })

  it('refuses a parent in another project, with the same message as a missing one', async () => {
    const { project, open } = await setup(user)
    const other = await setup(user)
    const foreign = await createTestCard(user, other.project.id, other.open)
    const card = await createTestCard(user, project.id, open)

    const res = await fetch(url(`/api/cards/${card.id}`), { method: 'PUT', body: JSON.stringify({ parentId: foreign.id }), headers: { ...user.headers, 'content-type': 'application/json' } })
    expect(res.status).toBe(400)
    const missing = await fetch(url(`/api/cards/${card.id}`), { method: 'PUT', body: JSON.stringify({ parentId: 99999999 }), headers: { ...user.headers, 'content-type': 'application/json' } })
    expect(missing.status).toBe(400)
    expect((await res.json()).message).toBe((await missing.json()).message)
  })

  it('keeps one level', async () => {
    const { project, open } = await setup(user)
    const parent = await createTestCard(user, project.id, open)
    const sub = await createSub(user, project.id, open, parent.id)
    const other = await createTestCard(user, project.id, open)

    // A sub-task cannot have sub-tasks…
    await expectError(createSub(user, project.id, open, sub.id), 400)
    await expectError(put(user, other.id, { parentId: sub.id }), 400)
    // …a parent cannot become a sub-task, and nothing is its own parent.
    await expectError(put(user, parent.id, { parentId: other.id }), 400)
    await expectError(put(user, other.id, { parentId: other.id }), 400)
  })

  it('attaches, moves and detaches an existing card, recording it on every card involved', async () => {
    const { project, open } = await setup(user)
    const a = await createTestCard(user, project.id, open, { title: 'A' })
    const b = await createTestCard(user, project.id, open, { title: 'B' })
    const card = await createTestCard(user, project.id, open, { title: 'Card' })

    await put(user, card.id, { parentId: a.id })
    await put(user, card.id, { parentId: b.id })
    await put(user, card.id, { parentId: null })
    expect((await getCard(user, card.id)).parentId).toBeNull()

    type Event = { field: string, from: { value: string } | null, to: { value: string } | null }
    const history = async (id: number) => (await $fetch<{ events: Event[] }>(`/api/cards/${id}/history`, { headers: user.headers })).events
      .filter(e => e.field === 'parent' || e.field === 'subtask')
      .map(e => [e.field, e.from?.value ?? null, e.to?.value ?? null])
    const t = (id: number) => `${project.key}-${id}`
    expect(await history(card.id)).toEqual([
      ['parent', null, t(a.id)],
      ['parent', t(a.id), t(b.id)],
      ['parent', t(b.id), null]
    ])
    expect(await history(a.id)).toEqual([['subtask', null, t(card.id)], ['subtask', t(card.id), null]])
    expect(await history(b.id)).toEqual([['subtask', null, t(card.id)], ['subtask', t(card.id), null]])
  })

  it('counts done sub-tasks by the project\'s done status, on views and the card', async () => {
    const { project, open, done } = await setup(user)
    const board = await createTestBoard(user, project.id)
    const parent = await createTestCard(user, project.id, open)
    await createSub(user, project.id, open, parent.id)
    await createSub(user, project.id, done, parent.id)

    const onBoard = (await getBoard(user, board.id)).cards.find((c: { id: number }) => c.id === parent.id)
    expect(onBoard.subtasks).toEqual({ total: 2, done: 1 })
    expect((await getCard(user, parent.id)).subtasks).toEqual({ total: 2, done: 1 })
  })

  it('refuses moving a parent with open sub-tasks into Done, on both write paths', async () => {
    const { project, open, done } = await setup(user)
    const parent = await createTestCard(user, project.id, open)
    const sub = await createSub(user, project.id, open, parent.id)

    const res = await fetch(url(`/api/cards/${parent.id}/move`), { method: 'PUT', body: JSON.stringify({ statusId: done, position: 0 }), headers: { ...user.headers, 'content-type': 'application/json' } })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.message).toContain(`${project.key}-${sub.id}`)
    expect(body.data.openSubtasks).toEqual([`${project.key}-${sub.id}`])
    await expectError(put(user, parent.id, { statusId: done }), 409)

    // Once the sub-task is done, so can the parent be.
    await put(user, sub.id, { statusId: done })
    await put(user, parent.id, { statusId: done })
  })

  it('guards only the move: a done parent may gain or reopen a sub-task', async () => {
    const { project, open, done } = await setup(user)
    const parent = await createTestCard(user, project.id, done)
    const sub = await createSub(user, project.id, done, parent.id)
    await put(user, sub.id, { statusId: open })
    await createSub(user, project.id, open, parent.id)
    expect((await getCard(user, parent.id)).subtasks).toEqual({ total: 2, done: 0 })
  })

  it('lets deleting a status move a parent with open sub-tasks into Done', async () => {
    // The rule guards a card's own move. Reassigning a deleted status's cards is a
    // change to the project's states, and refusing it would leave the status
    // undeletable for as long as any card in it has an open sub-task.
    const { project, open, done } = await setup(user)
    const doomed = await $fetch<{ id: string }>(`/api/projects/${project.id}/statuses`, { method: 'POST', body: { name: 'Doomed' }, headers: user.headers })
    const parent = await createTestCard(user, project.id, doomed.id)
    await createSub(user, project.id, open, parent.id)

    await $fetch(`/api/statuses/${doomed.id}`, { method: 'DELETE', body: { moveToStatusId: done }, headers: user.headers })
    const after = await $fetch<Detail & { statusId: string }>(`/api/cards/${parent.id}`, { headers: user.headers })
    expect(after.statusId).toBe(done)
    expect(after.subtasks).toEqual({ total: 1, done: 0 })
  })

  it('has no Done rule and counts nothing done when the project has no done status', async () => {
    const { project, open, done } = await setup(user)
    const board = await createTestBoard(user, project.id)
    const parent = await createTestCard(user, project.id, open)
    await createSub(user, project.id, open, parent.id)
    await createSub(user, project.id, done, parent.id)
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', body: { doneStatusId: null }, headers: user.headers })

    expect((await getCard(user, parent.id)).subtasks).toEqual({ total: 2, done: 0 })
    const onBoard = (await getBoard(user, board.id)).cards.find((c: { id: number }) => c.id === parent.id)
    expect(onBoard.subtasks).toEqual({ total: 2, done: 0 })
    // The former Done is an ordinary status now, so the parent may enter it.
    await $fetch(`/api/cards/${parent.id}/move`, { method: 'PUT', body: { statusId: done, position: 0 }, headers: user.headers })
    await put(user, parent.id, { statusId: open })
    await put(user, parent.id, { statusId: done })
  })

  it('still counts a done sub-task past retention, which the board no longer shows', async () => {
    // Retention hides old done cards from views; it does not undo them. A parent
    // whose finished sub-tasks aged out is still finished, not "0 of 0".
    const { project, open, done } = await setup(user)
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', body: { doneRetentionDays: 7 }, headers: user.headers })
    const board = await createTestBoard(user, project.id)
    const parent = await createTestCard(user, project.id, open)
    const old = await createSub(user, project.id, done, parent.id)
    const fresh = await createSub(user, project.id, open, parent.id)
    await $fetch('/api/_test/set-card-updated-at', { method: 'POST', body: { cardId: old.id, daysAgo: 30 } })
    // Boards hide sub-tasks by default; show them, so the expired one is absent for
    // retention's reason and not that one.
    await $fetch(`/api/boards/${board.id}`, { method: 'PUT', body: { showSubtasks: true }, headers: user.headers })

    const view = await getBoard(user, board.id)
    expect(view.cards.some((c: { id: number }) => c.id === old.id)).toBe(false)
    expect(view.cards.some((c: { id: number }) => c.id === fresh.id)).toBe(true)
    const onBoard = view.cards.find((c: { id: number }) => c.id === parent.id)
    expect(onBoard.subtasks).toEqual({ total: 2, done: 1 })
    expect((await getCard(user, parent.id)).subtasks).toEqual({ total: 2, done: 1 })
  })

  it('starts a sub-task outside Done when no status is named, even where Done is the oldest status', async () => {
    // Statuses have no position, and both the panel and a template copy took "the first
    // row": in a project whose oldest surviving status was Done, every new sub-task was
    // born finished and its parent counted it done.
    const { project, done } = await setup(user)
    const { statuses } = await $fetch<{ statuses: Status[] }>(`/api/projects/${project.id}`, { headers: user.headers })
    for (const s of statuses.filter(s => s.id !== done)) {
      await $fetch(`/api/statuses/${s.id}`, { method: 'DELETE', headers: user.headers })
    }
    const todo = await $fetch<{ id: string }>(`/api/projects/${project.id}/statuses`, { method: 'POST', body: { name: 'To Do' }, headers: user.headers })

    const parent = await createTestCard(user, project.id, todo.id)
    const sub = await $fetch<{ id: number, statusId: string }>(`/api/projects/${project.id}/cards`, { method: 'POST', body: { title: 'Sub', parentId: parent.id }, headers: user.headers })
    expect(sub.statusId).toBe(todo.id)

    const board = await createTestBoard(user, project.id)
    const copy = await $fetch<{ id: number }>(`/api/cards/${parent.id}/duplicate`, { method: 'POST', body: { title: 'Copy', boardId: board.id }, headers: user.headers })
    const copied = await getCard(user, copy.id)
    expect(copied.subtasks).toEqual({ total: 1, done: 0 })
  })

  it('turns sub-tasks into ordinary cards when their parent is deleted', async () => {
    const { project, open } = await setup(user)
    const parent = await createTestCard(user, project.id, open)
    const sub = await createSub(user, project.id, open, parent.id)
    await $fetch(`/api/cards/${parent.id}`, { method: 'DELETE', headers: user.headers })

    expect((await getCard(user, sub.id)).parentId).toBeNull()
    const { events } = await $fetch<{ events: Array<{ field: string, from: { value: string } | null, to: unknown }> }>(`/api/cards/${sub.id}/history`, { headers: user.headers })
    expect(events.at(-1)).toMatchObject({ field: 'parent', from: { value: `${project.key}-${parent.id}` }, to: null })
  })

  it('lists the cards a parent picker may offer: top-level, searchable by title or ticket', async () => {
    const { project, open } = await setup(user)
    const parent = await createTestCard(user, project.id, open, { title: 'Pick me 100%' })
    const sub = await createSub(user, project.id, open, parent.id, 'Pick me too')
    const list = (query: Record<string, string>) =>
      $fetch<Array<{ id: number }>>(`/api/projects/${project.id}/cards`, { query, headers: user.headers }).then(r => r.map(c => c.id))

    expect(await list({ parentId: 'none', q: 'Pick me' })).toEqual([parent.id])
    expect(await list({ parentId: String(parent.id) })).toEqual([sub.id])
    expect(await list({ q: `${project.key}-${sub.id}` })).toEqual([sub.id])
    // `%` is a literal, not a wildcard.
    expect(await list({ q: '100%' })).toEqual([parent.id])
  })

  it('stores whether a board or list shows sub-tasks, off for boards and on for lists by default', async () => {
    const { project } = await setup(user)
    const board = await createTestBoard(user, project.id)
    const list = await createTestList(user, project.id)
    expect((await getBoard(user, board.id)).showSubtasks).toBe(false)
    expect((await getList(user, list.id)).showSubtasks).toBe(true)

    await $fetch(`/api/boards/${board.id}`, { method: 'PUT', body: { showSubtasks: true }, headers: user.headers })
    await $fetch(`/api/lists/${list.id}`, { method: 'PUT', body: { showSubtasks: false }, headers: user.headers })
    expect((await getBoard(user, board.id)).showSubtasks).toBe(true)
    expect((await getList(user, list.id)).showSubtasks).toBe(false)

    await expectError($fetch(`/api/boards/${board.id}`, { method: 'PUT', body: { showSubtasks: 'yes' }, headers: user.headers }), 400)

    // The project endpoint returns the same booleans, not the column's 0 and 1.
    const detail = await $fetch<{ boards: Array<{ id: string, showSubtasks: unknown }>, lists: Array<{ id: string, showSubtasks: unknown }> }>(`/api/projects/${project.id}`, { headers: user.headers })
    expect(detail.boards.find(b => b.id === board.id)!.showSubtasks).toBe(true)
    expect(detail.lists.find(l => l.id === list.id)!.showSubtasks).toBe(false)
  })

  it('serves the panel its sub-task side alone, and hides it from non-members', async () => {
    const { project, open } = await setup(user)
    const parent = await createTestCard(user, project.id, open, { title: 'Parent' })
    const sub = await createSub(user, project.id, open, parent.id)
    const side = await $fetch<Detail & { project: { id: string, key: string }, statuses: Status[] }>(`/api/cards/${parent.id}/subtasks`, { headers: user.headers })
    expect(side.subtaskCards.map(c => c.ticket)).toEqual([`${project.key}-${sub.id}`])
    expect(side.subtasks).toEqual({ total: 1, done: 0 })
    expect(side.project.id).toBe(project.id)
    expect(side.statuses.length).toBeGreaterThan(0)
    expect(side).not.toHaveProperty('members')

    const stranger = await registerTestUser()
    await expectError($fetch(`/api/cards/${parent.id}/subtasks`, { headers: stranger.headers }), 404)
  })

  it('treats an empty parentId as no filter', async () => {
    const { project, open } = await setup(user)
    const parent = await createTestCard(user, project.id, open, { title: 'Parent' })
    await createSub(user, project.id, open, parent.id)
    const all = await $fetch<unknown[]>(`/api/projects/${project.id}/cards?parentId=`, { headers: user.headers })
    expect(all.length).toBe(2)
  })
})
