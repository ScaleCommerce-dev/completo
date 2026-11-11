import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard, createTestTag, setCardTags, uploadAttachment, createTestBoard } from '../../setup/fixtures'
import { createTestAgent, createAgentToken, setCanCreateAgents, addMember } from '../../setup/agents'
import type { CardHistoryField } from '../../../shared/utils/card-history-fields'

/**
 * A card's change history: who changed what, and exactly when.
 *
 * Every change is its own event, never merged, even five from one agent in a
 * second, so these tests read the whole list and compare it exactly rather than
 * looking for one entry: an extra event is as wrong as a missing one.
 */

type Field = CardHistoryField | 'created'

interface Side { id: string | null, value: string }

interface HistoryEvent {
  id: number
  field: Field
  from: Side | null
  to: Side | null
  actor: { id: string, name: string, kind: 'human' | 'agent', color: string | null, managedBy: { id: string, name: string } | null } | null
  actorName: string | null
  createdAt: string
}

interface History { events: HistoryEvent[], hasMore: boolean, total: number, projectId: string }

interface Status { id: string, name: string }

const history = (user: { headers: Record<string, string> }, cardId: number, query?: Record<string, string | number>) =>
  $fetch(`/api/cards/${cardId}/history`, { headers: user.headers, query }) as Promise<History>

/** The recorded changes, without the synthesized "created" entry. */
async function changes(user: TestUser, cardId: number): Promise<HistoryEvent[]> {
  return (await history(user, cardId)).events.filter(e => e.field !== 'created')
}

/** The comparable part of an event: what changed and who did it. */
const summary = (e: HistoryEvent) => ({ field: e.field, from: e.from, to: e.to, actor: e.actor?.id ?? null })

const put = (user: { headers: Record<string, string> }, cardId: number, body: Record<string, unknown>) =>
  $fetch(`/api/cards/${cardId}`, { method: 'PUT', body, headers: user.headers })

async function statusesOf(user: TestUser, projectId: string): Promise<Status[]> {
  return (await $fetch(`/api/projects/${projectId}`, { headers: user.headers }) as { statuses: Status[] }).statuses
}

async function setup(owner: TestUser) {
  const project = await createTestProject(owner)
  const statuses = await statusesOf(owner, project.id)
  const named = (name: string) => statuses.find(s => s.name === name)!
  return { project, statuses, named }
}

describe('Card history', () => {
  let owner: TestUser
  let member: TestUser
  let stranger: TestUser
  let admin: TestUser

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    stranger = await registerTestUser()
    admin = await createAdminUser()
  })

  describe('reading', () => {
    it('starts with who created the card and when, from the card itself', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id)

      const { events, hasMore, total } = await history(owner, card.id)
      expect(hasMore).toBe(false)
      expect(events).toHaveLength(1)
      expect(total).toBe(1)
      expect(events[0]).toMatchObject({ field: 'created', from: null, to: null, actorName: owner.name })
      expect(events[0]!.actor).toMatchObject({ id: owner.id, name: owner.name, kind: 'human', managedBy: null })
      const cardRow = await $fetch(`/api/cards/${card.id}`, { headers: owner.headers }) as { createdAt: string }
      expect(events[0]!.createdAt).toBe(cardRow.createdAt)
    })

    it('is a 404 for someone outside the project, and for a card that does not exist', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id)
      await expectError(history(stranger, card.id), 404)
      await expectError(history(owner, 999999999), 404)
    })

    it('pages backwards from the newest, and reaches the created entry on the last page', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { title: 'T0' })
      for (let i = 1; i <= 5; i++) await put(owner, card.id, { title: `T${i}` })

      const first = await history(owner, card.id, { limit: 2 })
      expect(first.hasMore).toBe(true)
      // The whole history, not the page: five changes and the creation. The
      // panel's Activity tab counts with it.
      expect(first.total).toBe(6)
      expect(first.events.map(e => e.to?.value)).toEqual(['T4', 'T5'])

      const second = await history(owner, card.id, { limit: 2, before: first.events[0]!.id })
      expect(second.hasMore).toBe(true)
      expect(second.events.map(e => e.to?.value)).toEqual(['T2', 'T3'])

      const last = await history(owner, card.id, { limit: 2, before: second.events[0]!.id })
      expect(last.hasMore).toBe(false)
      expect(last.events.map(e => e.field)).toEqual(['created', 'title'])
      expect(last.events[1]!.to?.value).toBe('T1')

      await expectError(history(owner, card.id, { limit: 0 }), 400)
      await expectError(history(owner, card.id, { before: 'x' }), 400)
    })

    it('reads forward from an id, oldest first, so an open timeline fetches only what is new', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { title: 'T0' })
      for (let i = 1; i <= 5; i++) await put(owner, card.id, { title: `T${i}` })
      const all = (await history(owner, card.id)).events
      expect((await history(owner, card.id)).projectId).toBe(project.id)

      const newer = await history(owner, card.id, { after: all[2]!.id, limit: 2 })
      expect(newer.events.map(e => e.to?.value)).toEqual(['T3', 'T4'])
      expect(newer.hasMore).toBe(true)
      expect(newer.total).toBe(6)

      const rest = await history(owner, card.id, { after: newer.events[1]!.id })
      expect(rest.events.map(e => e.to?.value)).toEqual(['T5'])
      expect(rest.hasMore).toBe(false)
      // Forward reads never repeat the creation: it is the start, not news.
      expect((await history(owner, card.id, { after: 0 })).events.map(e => e.field)).not.toContain('created')

      await expectError(history(owner, card.id, { after: 1, before: 9 }), 400)
      await expectError(history(owner, card.id, { after: -1 }), 400)
    })
  })

  describe('recording', () => {
    it('records each field once, with who, from and to', async () => {
      const { project, named } = await setup(owner)
      await addMember(owner, project.id, member.id)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { title: 'Before' })

      await put(owner, card.id, { title: 'After' })
      await put(owner, card.id, { statusId: named('To Do').id })
      await put(owner, card.id, { assigneeId: member.id })
      await put(owner, card.id, { priority: 'urgent' })
      await put(owner, card.id, { dueDate: '2026-12-01' })
      await put(owner, card.id, { description: 'Secret plan for the launch' })
      await put(owner, card.id, { assigneeId: null })
      await put(owner, card.id, { dueDate: null })

      const events = await changes(owner, card.id)
      expect(events.map(summary)).toEqual([
        { field: 'title', from: { id: null, value: 'Before' }, to: { id: null, value: 'After' }, actor: owner.id },
        { field: 'status', from: { id: named('Backlog').id, value: 'Backlog' }, to: { id: named('To Do').id, value: 'To Do' }, actor: owner.id },
        { field: 'assignee', from: null, to: { id: member.id, value: member.name }, actor: owner.id },
        { field: 'priority', from: { id: null, value: 'medium' }, to: { id: null, value: 'urgent' }, actor: owner.id },
        { field: 'dueDate', from: null, to: { id: null, value: '2026-12-01T00:00:00.000Z' }, actor: owner.id },
        { field: 'description', from: null, to: null, actor: owner.id },
        { field: 'assignee', from: { id: member.id, value: member.name }, to: null, actor: owner.id },
        { field: 'dueDate', from: { id: null, value: '2026-12-01T00:00:00.000Z' }, to: null, actor: owner.id }
      ])
      // "Edited the description" and nothing more: the text is the card's, not the history's.
      expect(JSON.stringify(await history(owner, card.id))).not.toContain('Secret plan')
    })

    it('records nothing for a save that changes nothing', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { title: 'Same', description: 'Text' })

      await put(owner, card.id, { title: 'Same', statusId: named('Backlog').id, priority: 'medium', assigneeId: null, dueDate: null, description: 'Text' })
      await $fetch(`/api/cards/${card.id}/tags`, { method: 'PUT', body: { tagIds: [] }, headers: owner.headers })

      expect(await changes(owner, card.id)).toEqual([])
    })

    it('records several fields saved at once as separate events, in one fixed order', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { title: 'A' })

      await put(owner, card.id, { priority: 'low', title: 'B', statusId: named('Review').id })

      expect((await changes(owner, card.id)).map(e => e.field)).toEqual(['title', 'status', 'priority'])
    })

    it('records a move to another column, and nothing for a reorder within one', async () => {
      const { project, named } = await setup(owner)
      const backlog = named('Backlog').id
      const first = await createTestCard(owner, project.id, backlog)
      const second = await createTestCard(owner, project.id, backlog)

      // Reordering renumbers every card in the column. None of that is history.
      await $fetch(`/api/cards/${second.id}/move`, { method: 'PUT', body: { statusId: backlog, position: 0 }, headers: owner.headers })
      expect(await changes(owner, first.id)).toEqual([])
      expect(await changes(owner, second.id)).toEqual([])

      await $fetch(`/api/cards/${second.id}/move`, { method: 'PUT', body: { statusId: named('In Progress').id, position: 0 }, headers: owner.headers })
      expect((await changes(owner, second.id)).map(summary)).toEqual([
        { field: 'status', from: { id: backlog, value: 'Backlog' }, to: { id: named('In Progress').id, value: 'In Progress' }, actor: owner.id }
      ])
      // The card left behind was renumbered, not changed.
      expect(await changes(owner, first.id)).toEqual([])
    })

    it('records the status changes in a board reorder, and not the renumbering', async () => {
      const { project, named } = await setup(owner)
      const board = await createTestBoard(owner, project.id)
      const backlog = named('Backlog').id
      const a = await createTestCard(owner, project.id, backlog)
      const b = await createTestCard(owner, project.id, backlog)

      await $fetch(`/api/boards/${board.id}/cards/reorder`, {
        method: 'PUT',
        body: { moves: [{ cardId: a.id, statusId: backlog, position: 1 }, { cardId: b.id, statusId: named('Done').id, position: 0 }] },
        headers: owner.headers
      })

      expect(await changes(owner, a.id)).toEqual([])
      expect((await changes(owner, b.id)).map(summary)).toEqual([
        { field: 'status', from: { id: backlog, value: 'Backlog' }, to: { id: named('Done').id, value: 'Done' }, actor: owner.id }
      ])
    })

    it('records each tag added and removed as its own event', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id)
      const bug = await createTestTag(owner, project.id, { name: 'Bug' })
      const ui = await createTestTag(owner, project.id, { name: 'UI' })

      await setCardTags(owner, card.id, [bug.id, ui.id])
      await setCardTags(owner, card.id, [ui.id])

      expect((await changes(owner, card.id)).map(summary)).toEqual([
        { field: 'tag', from: null, to: { id: bug.id, value: 'Bug' }, actor: owner.id },
        { field: 'tag', from: null, to: { id: ui.id, value: 'UI' }, actor: owner.id },
        { field: 'tag', from: { id: bug.id, value: 'Bug' }, to: null, actor: owner.id }
      ])
    })

    it('records attachments added and removed, by whoever did it', async () => {
      const { project, named } = await setup(owner)
      await addMember(owner, project.id, member.id)
      const card = await createTestCard(owner, project.id, named('Backlog').id)

      const file = await uploadAttachment(owner, card.id, { filename: 'spec.txt' })
      await $fetch(`/api/attachments/${file.id}`, { method: 'DELETE', headers: member.headers })

      expect((await changes(owner, card.id)).map(summary)).toEqual([
        { field: 'attachment', from: null, to: { id: file.id, value: 'spec.txt' }, actor: owner.id },
        { field: 'attachment', from: { id: file.id, value: 'spec.txt' }, to: null, actor: member.id }
      ])
    })

    it('keeps every one of a rapid burst, in the exact order it happened, to the millisecond', async () => {
      const { project, named } = await setup(owner)
      const card = await createTestCard(owner, project.id, named('Backlog').id)
      const sequence = ['low', 'high', 'medium', 'urgent', 'low', 'high', 'medium', 'urgent'] as const

      for (const priority of sequence) await put(owner, card.id, { priority })

      const events = await changes(owner, card.id)
      expect(events.map(e => e.to?.value)).toEqual([...sequence])
      expect(events.map(e => e.from?.value)).toEqual(['medium', ...sequence.slice(0, -1)])

      const times = events.map(e => new Date(e.createdAt).getTime())
      expect(times).toEqual([...times].sort((x, y) => x - y))
      // Whole seconds cannot order a burst. Eight stamps all on a second boundary
      // would mean the precision was thrown away somewhere on the way.
      expect(times.some(t => t % 1000 !== 0)).toBe(true)
      expect(new Set(events.map(e => e.id)).size).toBe(sequence.length)
    })
  })

  describe('attribution', () => {
    it('names the agent when an agent token makes the change', async () => {
      const { project, named } = await setup(owner)
      const agent = await createTestAgent(admin, { color: '#f97316' })
      await addMember(owner, project.id, agent.id)
      const token = await createAgentToken(admin, agent.id)
      const card = await createTestCard(owner, project.id, named('Backlog').id)

      await put(token, card.id, { statusId: named('Review').id })
      await setCardTags(token, card.id, [(await createTestTag(owner, project.id, { name: 'Agent work' })).id])

      const events = await changes(owner, card.id)
      expect(events.map(e => e.field)).toEqual(['status', 'tag'])
      for (const e of events) {
        expect(e.actor).toMatchObject({ id: agent.id, name: agent.name, kind: 'agent', color: '#f97316', managedBy: { id: admin.id, name: admin.name } })
        expect(e.actorName).toBe(agent.name)
      }
    })

    it('moves every card of a deleted status, recorded per card against the person who deleted it', async () => {
      const { project, named } = await setup(owner)
      const review = named('Review')
      const done = named('Done')
      const a = await createTestCard(owner, project.id, review.id)
      const b = await createTestCard(owner, project.id, review.id)

      await $fetch(`/api/statuses/${review.id}`, { method: 'DELETE', body: { moveToStatusId: done.id }, headers: owner.headers })

      for (const card of [a, b]) {
        expect((await changes(owner, card.id)).map(summary)).toEqual([
          // The status is gone; the name it had is what the entry still says.
          { field: 'status', from: { id: review.id, value: 'Review' }, to: { id: done.id, value: 'Done' }, actor: owner.id }
        ])
      }
    })

    it('records the unassignment when an agent leaves with its manager, against whoever removed the manager', async () => {
      const manager = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      const { project, named } = await setup(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager)
      await addMember(owner, project.id, agent.id)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { assigneeId: agent.id })

      await $fetch(`/api/projects/${project.id}/members/${manager.id}`, { method: 'DELETE', headers: owner.headers })

      expect((await changes(owner, card.id)).map(summary)).toEqual([
        { field: 'assignee', from: { id: agent.id, value: agent.name }, to: null, actor: owner.id }
      ])
    })

    it('records the unassignment when an agent is removed directly, or a transfer prunes it', async () => {
      const manager = await registerTestUser()
      const receiver = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      await setCanCreateAgents(admin, receiver, true)
      const { project, named } = await setup(owner)
      await addMember(owner, project.id, manager.id)
      const removed = await createTestAgent(manager)
      const transferred = await createTestAgent(manager)
      for (const agent of [removed, transferred]) await addMember(owner, project.id, agent.id)
      const first = await createTestCard(owner, project.id, named('Backlog').id, { assigneeId: removed.id })
      const second = await createTestCard(owner, project.id, named('Backlog').id, { assigneeId: transferred.id })

      await $fetch(`/api/projects/${project.id}/members/${removed.id}`, { method: 'DELETE', headers: manager.headers })
      // The receiver is not in this project, so the agent leaves it on the way.
      await $fetch(`/api/agents/${transferred.id}/transfer`, { method: 'POST', body: { toUserId: receiver.id }, headers: admin.headers })

      expect((await changes(owner, first.id)).map(summary)).toEqual([
        { field: 'assignee', from: { id: removed.id, value: removed.name }, to: null, actor: manager.id }
      ])
      expect((await changes(owner, second.id)).map(summary)).toEqual([
        { field: 'assignee', from: { id: transferred.id, value: transferred.name }, to: null, actor: admin.id }
      ])
    })

    it('records the unassignment when the assignee\'s account is deleted, against whoever deleted it', async () => {
      const { project, named } = await setup(owner)
      const leaving = await registerTestUser()
      await addMember(owner, project.id, leaving.id)
      const card = await createTestCard(owner, project.id, named('Backlog').id, { assigneeId: leaving.id })

      await $fetch(`/api/user/${leaving.id}`, { method: 'DELETE', headers: admin.headers })

      expect((await changes(owner, card.id)).map(summary)).toEqual([
        { field: 'assignee', from: { id: leaving.id, value: leaving.name }, to: null, actor: admin.id }
      ])
    })

    it('records a deleted tag as removed from each card that carried it, against whoever deleted it', async () => {
      const { project, named } = await setup(owner)
      const tag = await createTestTag(owner, project.id, { name: 'Doomed' })
      const card = await createTestCard(owner, project.id, named('Backlog').id)
      await setCardTags(owner, card.id, [tag.id])

      await $fetch(`/api/tags/${tag.id}`, { method: 'DELETE', headers: owner.headers })

      expect((await changes(owner, card.id)).map(summary)).toEqual([
        { field: 'tag', from: null, to: { id: tag.id, value: 'Doomed' }, actor: owner.id },
        { field: 'tag', from: { id: tag.id, value: 'Doomed' }, to: null, actor: owner.id }
      ])
    })
  })

  describe('names that change later', () => {
    it('reads a renamed status, tag or person by the name they have now', async () => {
      const { project, named } = await setup(owner)
      const renamed = await registerTestUser()
      await addMember(owner, project.id, renamed.id)
      const tag = await createTestTag(owner, project.id, { name: 'Old tag' })
      const card = await createTestCard(owner, project.id, named('Backlog').id)
      await put(owner, card.id, { statusId: named('Review').id, assigneeId: renamed.id })
      await setCardTags(owner, card.id, [tag.id])

      await $fetch(`/api/statuses/${named('Review').id}`, { method: 'PUT', body: { name: 'In review' }, headers: owner.headers })
      await $fetch(`/api/tags/${tag.id}`, { method: 'PUT', body: { name: 'New tag' }, headers: owner.headers })
      await $fetch('/api/user/profile', { method: 'PUT', body: { name: 'Renamed Person' }, headers: renamed.headers })

      const events = await changes(owner, card.id)
      expect(events.find(e => e.field === 'status')!.to).toEqual({ id: named('Review').id, value: 'In review' })
      expect(events.find(e => e.field === 'assignee')!.to).toEqual({ id: renamed.id, value: 'Renamed Person' })
      expect(events.find(e => e.field === 'tag')!.to).toEqual({ id: tag.id, value: 'New tag' })
    })

    it('still reads a deleted status, tag, assignee and actor by the name they had', async () => {
      const { project, named } = await setup(owner)
      const gone = await registerTestUser()
      await addMember(owner, project.id, gone.id)
      const tag = await createTestTag(owner, project.id, { name: 'Gone tag' })
      const card = await createTestCard(owner, project.id, named('Backlog').id)
      await put(owner, card.id, { assigneeId: gone.id })
      await put(gone, card.id, { statusId: named('Review').id })
      await setCardTags(owner, card.id, [tag.id])

      await $fetch(`/api/statuses/${named('Review').id}`, { method: 'DELETE', body: { moveToStatusId: named('Done').id }, headers: owner.headers })
      await $fetch(`/api/tags/${tag.id}`, { method: 'DELETE', headers: owner.headers })
      await $fetch(`/api/user/${gone.id}`, { method: 'DELETE', headers: admin.headers })

      const events = await changes(owner, card.id)
      expect(events.find(e => e.field === 'assignee')!.to).toEqual({ id: gone.id, value: gone.name })
      const moved = events.find(e => e.field === 'status')!
      expect(moved.to).toEqual({ id: named('Review').id, value: 'Review' })
      // The account that made the move is gone; the entry still says who it was.
      expect(moved.actor).toBeNull()
      expect(moved.actorName).toBe(gone.name)
      expect(events.find(e => e.field === 'tag')!.to).toEqual({ id: tag.id, value: 'Gone tag' })
    })
  })
})
