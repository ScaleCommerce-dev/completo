import { describe, it, expect } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createTestToken } from '../../setup/auth'
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
