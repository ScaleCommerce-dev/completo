import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestTag, setCardTags, getBoard } from '../../setup/fixtures'

interface Hit {
  id: number
  title: string
  projectId: string
  projectName: string
  projectSlug: string
  projectKey: string
  statusName: string | null
  isDone: boolean
  snippet: string | null
  assignee: { id: string, name: string } | null
  tags: Array<{ id: string, name: string }>
}

const search = (user: TestUser, q: string) =>
  $fetch<Hit[]>('/api/cards/search', { params: { q }, headers: user.headers })

/**
 * The command palette's card search. What matters here is the *scope* — this is
 * the only card endpoint that takes no project in the URL, so it is the only one
 * that has to decide for itself which projects the caller may see.
 */
describe('GET /api/cards/search', async () => {
  let user: TestUser
  let stranger: TestUser
  let statusId: string
  let project: Awaited<ReturnType<typeof createTestProject>>
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

  beforeAll(async () => {
    user = await registerTestUser()
    stranger = await registerTestUser()
    project = await createTestProject(user, { name: `Search ${stamp}` })
    const board = await createTestBoard(user, project.id)
    statusId = (await getBoard(user, board.id)).columns[0]!.id
  })

  it('matches the title, case-insensitively', async () => {
    const card = await createTestCard(user, project.id, statusId, { title: `Rename the WIDGET ${stamp}` })

    const hits = await search(user, `widget ${stamp}`)
    expect(hits.map(h => h.id)).toContain(card.id)
  })

  it('matches the description, which is how a card with an unmemorable title is found', async () => {
    const card = await createTestCard(user, project.id, statusId, {
      title: `Untitled ${stamp}`,
      description: `The parallax hero ${stamp} stutters on Safari.`
    })

    const hits = await search(user, `parallax hero ${stamp}`)
    expect(hits.map(h => h.id)).toContain(card.id)
  })

  it('resolves a ticket id, with or without the project key', async () => {
    const card = await createTestCard(user, project.id, statusId, { title: `Findable by id ${stamp}` })

    for (const q of [`${project.key}-${card.id}`, `${project.key.toLowerCase()}-${card.id}`, String(card.id)]) {
      const hits = await search(user, q)
      expect(hits[0]?.id, `first hit for "${q}"`).toBe(card.id)
    }
  })

  it('ranks the card whose id was typed above cards that merely mention the number', async () => {
    const target = await createTestCard(user, project.id, statusId, { title: `Target ${stamp}` })
    const ticket = `${project.key}-${target.id}`
    // Both quote the ticket in their title, so both match; both are newer, so
    // recency alone would put them ahead of the card actually being named.
    await createTestCard(user, project.id, statusId, { title: `Blocked by ${ticket} ${stamp}` })
    await createTestCard(user, project.id, statusId, { title: `Duplicate of ${ticket} ${stamp}` })

    const hits = await search(user, ticket)
    expect(hits.length).toBe(3)
    expect(hits[0]?.id).toBe(target.id)
  })

  it('carries the project a card belongs to, since results span projects', async () => {
    const card = await createTestCard(user, project.id, statusId, { title: `Attributed ${stamp}` })

    const hit = (await search(user, `Attributed ${stamp}`)).find(h => h.id === card.id)
    expect(hit).toMatchObject({
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      projectKey: project.key
    })
    expect(hit?.statusName).toBeTruthy()
  })

  /**
   * The palette's preview pane renders straight from the search response, so
   * that response has to carry everything the pane shows. Fetching the
   * highlighted card instead would put a request between the reader and the
   * answer on every press of ↑ or ↓.
   */
  it('carries what the preview pane renders, without a second request', async () => {
    const tag = await createTestTag(user, project.id, { name: `preview-${stamp}` })
    const card = await createTestCard(user, project.id, statusId, {
      title: `Previewable ${stamp}`,
      description: '## Context\n\n- [ ] The nightly export writes a zero-byte file.',
      assigneeId: user.id,
      dueDate: '2030-01-15'
    })
    await setCardTags(user, card.id, [tag.id])

    const hit = (await search(user, `Previewable ${stamp}`)).find(h => h.id === card.id)!
    expect(hit.assignee?.id).toBe(user.id)
    expect(hit.tags.map(t => t.name)).toEqual([`preview-${stamp}`])
    // Flattened: the pane shows a few lines, so heading and bullet markers go.
    expect(hit.snippet).toBe('Context The nightly export writes a zero-byte file.')
  })

  it('centres the snippet on the match rather than on the description opening', async () => {
    const card = await createTestCard(user, project.id, statusId, {
      title: `Deep match ${stamp}`,
      description: `${'Preamble sentence that goes on. '.repeat(20)}The kryptonite${stamp} is here.`
    })

    const hit = (await search(user, `kryptonite${stamp}`)).find(h => h.id === card.id)!
    expect(hit.snippet).toContain(`kryptonite${stamp}`)
    expect(hit.snippet!.startsWith('…')).toBe(true)
  })

  it('reports whether a card sits in its project\'s done status', async () => {
    const board = await getBoard(user, (await createTestBoard(user, project.id)).id)
    const done = board.columns.find(c => c.name === 'Done') || board.columns.at(-1)!
    const open = await createTestCard(user, project.id, statusId, { title: `Openstate ${stamp}` })
    const closed = await createTestCard(user, project.id, done.id, { title: `Donestate ${stamp}` })

    const hits = await search(user, `state ${stamp}`)
    expect(hits.find(h => h.id === open.id)?.isDone).toBe(false)
    expect(hits.find(h => h.id === closed.id)?.isDone).toBe(true)
  })

  it('spans every project the caller is a member of', async () => {
    const other = await createTestProject(user, { name: `Second ${stamp}` })
    const board = await createTestBoard(user, other.id)
    const otherStatus = (await getBoard(user, board.id)).columns[0]!.id
    const here = await createTestCard(user, project.id, statusId, { title: `Crossproject ${stamp} one` })
    const there = await createTestCard(user, other.id, otherStatus, { title: `Crossproject ${stamp} two` })

    const ids = (await search(user, `Crossproject ${stamp}`)).map(h => h.id)
    expect(ids).toEqual(expect.arrayContaining([here.id, there.id]))
  })

  it('never returns a card from a project the caller is not in', async () => {
    const card = await createTestCard(user, project.id, statusId, { title: `Private ${stamp}` })

    const hits = await search(stranger, `Private ${stamp}`)
    expect(hits.map(h => h.id)).not.toContain(card.id)
    // Absent, not forbidden — a 403 would confirm the card exists.
    expect(hits).toEqual([])
  })

  it('lets an instance admin see cards in projects they never joined', async () => {
    const admin = await createAdminUser()
    const card = await createTestCard(user, project.id, statusId, { title: `Adminvisible ${stamp}` })

    const hits = await search(admin, `Adminvisible ${stamp}`)
    expect(hits.map(h => h.id)).toContain(card.id)
  })

  it('treats % and _ as literals rather than wildcards', async () => {
    const card = await createTestCard(user, project.id, statusId, { title: `Coverage 50% ${stamp}` })
    await createTestCard(user, project.id, statusId, { title: `Coverage 50 percent ${stamp}` })

    const hits = await search(user, `50% ${stamp}`)
    expect(hits.map(h => h.id)).toEqual([card.id])
  })

  it('returns nothing for a one-character substring, rather than most of the board', async () => {
    await createTestCard(user, project.id, statusId, { title: `Aardvark ${stamp}` })

    expect(await search(user, 'a')).toEqual([])
    expect(await search(user, ' ')).toEqual([])
  })

  it('treats a one-character *number* as an id lookup rather than rejecting it', async () => {
    // Card 7 may or may not be one this user can see, and that is not the
    // point: what must hold is that "7" resolves an id and does not fall back
    // to scanning for the digit, which is the whole reason for the length floor.
    await createTestCard(user, project.id, statusId, { title: `Contains a 7 ${stamp}` })

    const hits = await search(user, '7')
    expect(hits.length).toBeLessThanOrEqual(1)
    expect(hits.map(h => h.id).filter(id => id !== 7)).toEqual([])
  })

  it('caps the result set', async () => {
    const many = `Bulk${stamp}`
    for (let i = 0; i < 12; i++) {
      await createTestCard(user, project.id, statusId, { title: `${many} ${i}` })
    }

    expect((await search(user, many)).length).toBe(10)
  })
})
