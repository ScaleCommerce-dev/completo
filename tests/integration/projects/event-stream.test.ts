import { describe, it, expect } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, createTestToken } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'
import { addMember } from '../../setup/agents'

/**
 * Membership used to be checked only when the stream connected, so a member who
 * kept `/api/events` open went on receiving every card row — descriptions
 * included — after being removed. Each push now re-checks and ends the stream.
 */

/** Read SSE text until `done` says stop or the stream ends; resolves with what arrived. */
async function readUntil(body: ReadableStream<Uint8Array>, done: (text: string) => boolean, ms = 5000) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let ended = false
  // Cancelling also ends the read loop, so remember it: a timeout is not the
  // server closing the stream.
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    reader.cancel().catch(() => {})
  }, ms)
  try {
    while (!done(text)) {
      const { value, done: end } = await reader.read()
      if (end) {
        ended = true
        break
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
  return { text, ended: ended && !timedOut }
}

describe('GET /api/events after the member is removed', () => {
  for (const via of ['cookie', 'token'] as const) {
    it(`ends the stream and sends no card (${via})`, async () => {
      const owner = await registerTestUser()
      const member = await registerTestUser()
      const project = await createTestProject(owner)
      const board = await createTestBoard(owner, project.id)
      const statusId = (await getBoard(owner, board.id)).columns[0].id
      await addMember(owner, project.id, member.id)

      const headers = via === 'cookie' ? member.headers : (await createTestToken(member)).headers
      const res = await fetch(url(`/api/events?projectId=${project.id}`), { headers })
      expect(res.status).toBe(200)
      const body = res.body!

      // Control: while a member, a new card arrives.
      const visible = createTestCard(owner, project.id, statusId, { title: 'Visible card' })
      const first = await readUntil(body, t => t.includes('Visible card'))
      await visible
      expect(first.text).toContain('Visible card')

      await $fetch(`/api/projects/${project.id}/members/${member.id}`, { method: 'DELETE', headers: owner.headers })
      await createTestCard(owner, project.id, statusId, { title: 'Secret card', description: 'not for leavers' })

      const rest = await readUntil(body, () => false)
      expect(rest.text).not.toContain('Secret card')
      expect(rest.ended).toBe(true)
    })
  }
})

/**
 * `?scope=mine` is the Calendar page's stream: card events from every project
 * the caller is a member of. One line decides that (`isProjectMember`, per
 * event), and without it the stream is every card row on the instance.
 *
 * Each test emits the card that must not arrive *before* one that must, on the
 * same bus: events are pushed in emit order, so once the second has arrived the
 * first would have too.
 */
describe.concurrent('GET /api/events?scope=mine', () => {
  const firstStatus = async (user: Parameters<typeof createTestBoard>[0], projectId: string) => {
    const board = await createTestBoard(user, projectId)
    return (await getBoard(user, board.id)).columns[0].id as string
  }

  for (const who of ['member', 'admin'] as const) {
    it(`sends cards of the caller's projects and none of anyone else's (${who})`, async () => {
      // An admin is the sharper case: the per-project stream elevates them, and
      // this one must not, as the Calendar itself does not.
      const reader = who === 'admin' ? await createAdminUser() : await registerTestUser()
      const stranger = await registerTestUser()
      const mine = await createTestProject(reader)
      const theirs = await createTestProject(stranger)
      const myStatus = await firstStatus(reader, mine.id)
      const theirStatus = await firstStatus(stranger, theirs.id)

      const res = await fetch(url('/api/events?scope=mine'), { headers: reader.headers })
      expect(res.status).toBe(200)

      await createTestCard(stranger, theirs.id, theirStatus, { title: 'Foreign card', description: 'not for outsiders' })
      const own = createTestCard(reader, mine.id, myStatus, { title: 'Own card' })
      const got = await readUntil(res.body!, t => t.includes('Own card'))
      await own

      expect(got.text).toContain('Own card')
      expect(got.text).not.toContain('Foreign card')
    })
  }

  it('stops sending a project\'s cards once the caller is removed from it', async () => {
    const owner = await registerTestUser()
    const member = await registerTestUser()
    const shared = await createTestProject(owner)
    const own = await createTestProject(member)
    const sharedStatus = await firstStatus(owner, shared.id)
    const ownStatus = await firstStatus(member, own.id)
    await addMember(owner, shared.id, member.id)

    const res = await fetch(url('/api/events?scope=mine'), { headers: member.headers })
    expect(res.status).toBe(200)
    const body = res.body!

    // Control: while a member, the shared project's card arrives.
    const visible = createTestCard(owner, shared.id, sharedStatus, { title: 'Visible card' })
    const first = await readUntil(body, t => t.includes('Visible card'))
    await visible
    expect(first.text).toContain('Visible card')

    await $fetch(`/api/projects/${shared.id}/members/${member.id}`, { method: 'DELETE', headers: owner.headers })
    await createTestCard(owner, shared.id, sharedStatus, { title: 'Secret card', description: 'not for leavers' })
    const still = createTestCard(member, own.id, ownStatus, { title: 'Still mine' })
    const rest = await readUntil(body, t => t.includes('Still mine'))
    await still

    // The stream stays open, since the caller is still signed in and still has
    // projects; only the project they left goes quiet.
    expect(rest.text).toContain('Still mine')
    expect(rest.text).not.toContain('Secret card')
  })

  it('refuses an anonymous caller', async () => {
    const res = await fetch(url('/api/events?scope=mine'))
    expect(res.status).toBe(401)
  })
})
