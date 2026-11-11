import { describe, it, expect } from 'vitest'
import { describeChange, mergeTimeline, timelineFor, timelineLoading, type CardHistoryEvent } from '../../app/utils/card-history'
import { CARD_HISTORY_FIELDS } from '../../shared/utils/card-history-fields'

/**
 * The card panel's timeline: comments and changes in one chronological list,
 * each change a sentence about who did what.
 */

const claude = { id: 'agent-1', name: 'Claude', avatarUrl: null, kind: 'agent' as const }
const ann = { id: 'user-1', name: 'Ann', avatarUrl: null, kind: 'human' as const }

let nextId = 1
function change(over: Partial<CardHistoryEvent>): CardHistoryEvent {
  return { id: nextId++, field: 'status', from: null, to: null, actor: claude, actorName: 'Claude', createdAt: '2026-11-03T10:00:00.000Z', ...over }
}

const text = (e: CardHistoryEvent) => describeChange(e).map(p => p.text).join('')
const strong = (e: CardHistoryEvent) => describeChange(e).filter(p => p.strong).map(p => p.text)

describe('describeChange', () => {
  it('says what moved where', () => {
    const e = change({ field: 'status', from: { id: 's1', value: 'To Do' }, to: { id: 's2', value: 'Review' } })
    expect(text(e)).toBe('moved this from To Do to Review')
    expect(strong(e)).toEqual(['To Do', 'Review'])
  })

  it('tells assigning, reassigning, unassigning and taking it yourself apart', () => {
    expect(text(change({ field: 'assignee', to: { id: 'user-1', value: 'Ann' } }))).toBe('assigned Ann')
    expect(text(change({ field: 'assignee', from: { id: 'user-1', value: 'Ann' }, to: { id: 'agent-1', value: 'Claude' } }))).toBe('reassigned this from Ann to Claude')
    expect(text(change({ field: 'assignee', from: { id: 'user-1', value: 'Ann' } }))).toBe('unassigned Ann')
    expect(text(change({ field: 'assignee', to: { id: 'agent-1', value: 'Claude' } }))).toBe('self-assigned this')
    expect(text(change({ field: 'assignee', from: { id: 'agent-1', value: 'Claude' } }))).toBe('unassigned themselves')
  })

  it('names priorities by their label', () => {
    expect(text(change({ field: 'priority', from: { id: null, value: 'medium' }, to: { id: null, value: 'urgent' } }))).toBe('changed the priority from Medium to Urgent')
  })

  it('says a cleared priority was cleared, and what it was', () => {
    // The API, the CLI and /mcp can send `priority: null`. Read as "to High"
    // it said the opposite of what happened.
    const e = change({ field: 'priority', from: { id: null, value: 'high' } })
    expect(text(e)).toBe('cleared the priority (was High)')
    expect(text(change({ field: 'priority', to: { id: null, value: 'low' } }))).toBe('set the priority to Low')
  })

  it('never reads a one-sided change the wrong way round', () => {
    expect(text(change({ field: 'status', from: { id: 's1', value: 'To Do' } }))).toBe('moved this from To Do')
    expect(text(change({ field: 'title', from: { id: null, value: 'Old' } }))).toBe('renamed this from Old')
  })

  it('still says "themselves" once the actor deleted their own account', () => {
    // Deleting an account nulls the actor on its events, so the id comparison
    // has nothing to compare against; the name stored with the event still does.
    const e = change({ field: 'assignee', actor: null, actorName: 'Alice', from: { id: 'gone-1', value: 'Alice' } })
    expect(text(e)).toBe('unassigned themselves')
    expect(text(change({ field: 'assignee', actor: null, actorName: 'Alice', from: { id: 'gone-2', value: 'Bob' } }))).toBe('unassigned Bob')
  })

  it('has a sentence for every field the history records', () => {
    for (const field of CARD_HISTORY_FIELDS) {
      expect(text(change({ field, from: { id: 'a', value: 'A' }, to: { id: 'b', value: 'B' } })), field).not.toBe('')
    }
  })

  it('sets, changes and removes a due date', () => {
    const dec1 = { id: null, value: '2026-12-01T00:00:00.000Z' }
    const dec5 = { id: null, value: '2026-12-05T00:00:00.000Z' }
    expect(text(change({ field: 'dueDate', to: dec1 }))).toMatch(/^set the due date to Dec 1/)
    expect(text(change({ field: 'dueDate', from: dec1, to: dec5 }))).toMatch(/^changed the due date from Dec 1(, 2026)? to Dec 5/)
    expect(text(change({ field: 'dueDate', from: dec1 }))).toBe('removed the due date')
  })

  it('reports the title both ways, the description without its text', () => {
    expect(text(change({ field: 'title', from: { id: null, value: 'Old' }, to: { id: null, value: 'New' } }))).toBe('renamed this from Old to New')
    expect(text(change({ field: 'description' }))).toBe('edited the description')
  })

  it('adds and removes tags and files', () => {
    expect(text(change({ field: 'tag', to: { id: 't', value: 'Bug' } }))).toBe('added the tag Bug')
    expect(text(change({ field: 'tag', from: { id: 't', value: 'Bug' } }))).toBe('removed the tag Bug')
    expect(text(change({ field: 'attachment', to: { id: 'a', value: 'spec.pdf' } }))).toBe('attached spec.pdf')
    expect(text(change({ field: 'attachment', from: { id: 'a', value: 'spec.pdf' } }))).toBe('removed the attachment spec.pdf')
  })

  it('opens with the creation', () => {
    expect(text(change({ id: 0, field: 'created', actor: ann }))).toBe('created this')
  })
})

describe('mergeTimeline', () => {
  const comment = (id: string, createdAt: string) => ({ id, createdAt })

  it('interleaves comments and changes by time, keeping the changes in their recorded order', () => {
    // Two changes in one millisecond, and a clock that stepped back between the
    // next two: the server's order (by id) is the truth either way.
    const a = change({ id: 1, createdAt: '2026-11-03T10:00:01.500Z' })
    const b = change({ id: 2, createdAt: '2026-11-03T10:00:01.500Z' })
    const c = change({ id: 3, createdAt: '2026-11-03T10:05:00.900Z' })
    const d = change({ id: 4, createdAt: '2026-11-03T10:05:00.100Z' })
    const items = mergeTimeline([comment('x', '2026-11-03T10:02:00.000Z'), comment('y', '2026-11-03T10:10:00.000Z')], [a, b, c, d])
    expect(items.map(i => i.key)).toEqual(['event-1', 'event-2', 'comment-x', 'event-3', 'event-4', 'comment-y'])
  })

  it('puts a change before a comment stamped in the same second', () => {
    // Comment times are whole seconds, so "10:00:00" means some time in that
    // second; the creation, stamped the same way, must still come first.
    const created = change({ id: 0, field: 'created', createdAt: '2026-11-03T10:00:00.000Z' })
    const items = mergeTimeline([comment('x', '2026-11-03T10:00:00.000Z')], [created])
    expect(items.map(i => i.key)).toEqual(['event-0', 'comment-x'])
  })

  it('rules off every record but runs of changes, which share one', () => {
    const items = mergeTimeline(
      [comment('x', '2026-11-03T10:02:00.000Z'), comment('y', '2026-11-03T10:03:00.000Z')],
      [change({ id: 1, createdAt: '2026-11-03T10:00:00.000Z' }), change({ id: 2, createdAt: '2026-11-03T10:01:00.000Z' }), change({ id: 3, createdAt: '2026-11-03T10:04:00.000Z' })]
    )
    expect(items.map(i => [i.key, i.ruled])).toEqual([
      ['event-1', false],
      ['event-2', false],
      ['comment-x', true],
      ['comment-y', true],
      ['event-3', true]
    ])
  })

  it('is the comments alone, ruled as before, without changes', () => {
    const items = mergeTimeline([comment('x', '2026-11-03T10:02:00.000Z'), comment('y', '2026-11-03T10:03:00.000Z')], [])
    expect(items.map(i => [i.key, i.ruled])).toEqual([['comment-x', false], ['comment-y', true]])
  })
})

describe('timelineFor', () => {
  const comments = [{ id: 'x', createdAt: '2026-11-03T10:02:00.000Z' }]
  const events = [change({ id: 7, createdAt: '2026-11-03T10:00:00.000Z' }), change({ id: 8, createdAt: '2026-11-03T10:05:00.000Z' })]

  it('shows both on All, only comments on Comments, only changes on Activity', () => {
    expect(timelineFor('all', comments, events).map(i => i.key)).toEqual(['event-7', 'comment-x', 'event-8'])
    expect(timelineFor('comments', comments, events).map(i => i.key)).toEqual(['comment-x'])
    expect(timelineFor('activity', comments, events).map(i => i.key)).toEqual(['event-7', 'event-8'])
  })

  it('runs the changes together on Activity, with no rule between them', () => {
    expect(timelineFor('activity', comments, events).map(i => i.ruled)).toEqual([false, false])
  })
})

describe('timelineLoading', () => {
  const none = { commentsLoading: false, commentCount: 0, historyLoading: false, historyCount: 0 }

  it('waits on each tab\'s own data, so loaded changes never hide behind loading comments', () => {
    const commentsPending = { ...none, commentsLoading: true, historyCount: 4 }
    expect(timelineLoading('comments', commentsPending)).toBe(true)
    expect(timelineLoading('activity', commentsPending)).toBe(false)
    expect(timelineLoading('all', commentsPending)).toBe(false)

    const historyPending = { ...none, historyLoading: true, commentCount: 2 }
    expect(timelineLoading('comments', historyPending)).toBe(false)
    expect(timelineLoading('activity', historyPending)).toBe(true)
    expect(timelineLoading('all', historyPending)).toBe(false)

    expect(timelineLoading('all', { ...none, commentsLoading: true, historyLoading: true })).toBe(true)
  })
})
