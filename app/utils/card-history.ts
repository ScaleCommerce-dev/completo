import type { PersonRef } from '~/types/card'
import type { CardHistoryField } from '#shared/utils/card-history-fields'
import { priorityLabel } from './constants'
import { formatDueDate } from './formatting'

/**
 * A card's history as the panel shows it: each change a short sentence about who
 * did what, threaded between the comments in one chronological list.
 *
 * Pure, so `tests/unit/card-history.test.ts` can pin the wording and the order
 * without mounting the panel. The shape is `GET /api/cards/:id/history`'s.
 */

/** The stored fields (`shared/utils/card-history-fields.ts`), and the creation read off the card. */
export type HistoryField = CardHistoryField | 'created'

export interface HistorySide {
  id: string | null
  value: string
}

export interface CardHistoryEvent {
  /** Increases with every change, so it is the order; 0 for the creation. */
  id: number
  field: HistoryField
  from: HistorySide | null
  to: HistorySide | null
  /** Null once the account is gone; `actorName` still says who it was. */
  actor: PersonRef | null
  actorName: string | null
  createdAt: string
}

/** A run of a sentence. `strong` marks the names and values it reports. */
export interface Phrase {
  text: string
  strong?: boolean
}

const plain = (text: string): Phrase => ({ text })
const strong = (text: string): Phrase => ({ text, strong: true })

/**
 * Either side, as "from X to Y" or whichever half exists. A one-sided change is
 * read the way round it happened: a lone `from` says "from", never "to".
 */
function fromTo(verb: string, from: string | undefined, to: string | undefined, show = (v: string) => v): Phrase[] {
  if (from && to) return [plain(`${verb} from `), strong(show(from)), plain(' to '), strong(show(to))]
  if (to) return [plain(`${verb} to `), strong(show(to))]
  return [plain(`${verb} from `), strong(show(from ?? ''))]
}

/** What the actor did, without the actor: the panel prints the name before it. */
export function describeChange(e: CardHistoryEvent): Phrase[] {
  const from = e.from?.value
  const to = e.to?.value
  // Compared by id while the actor's account exists. Deleting it nulls the
  // actor on its events, so then by the name stored with the event, which for
  // an account removing itself is the same snapshot as the side's.
  const self = (side: HistorySide | null) => !!side?.id && (e.actor ? side.id === e.actor.id : side.value === e.actorName)

  switch (e.field) {
    case 'created':
      return [plain('created this')]
    case 'status':
      return fromTo('moved this', from, to)
    case 'assignee':
      if (e.from && e.to) return [plain('reassigned this from '), strong(e.from.value), plain(' to '), strong(e.to.value)]
      if (e.to) return self(e.to) ? [plain('self-assigned this')] : [plain('assigned '), strong(e.to.value)]
      return self(e.from) ? [plain('unassigned themselves')] : [plain('unassigned '), strong(from ?? '')]
    case 'priority':
      // `priority: null` is accepted by the API, so a priority can be cleared.
      if (!e.to) return [plain('cleared the priority (was '), strong(priorityLabel(from ?? '')), plain(')')]
      return e.from ? fromTo('changed the priority', from, to, priorityLabel) : fromTo('set the priority', undefined, to, priorityLabel)
    case 'dueDate':
      if (!e.to) return [plain('removed the due date')]
      return e.from ? fromTo('changed the due date', from, to, formatDueDate) : fromTo('set the due date', undefined, to, formatDueDate)
    case 'title':
      return fromTo('renamed this', from, to)
    case 'description':
      return [plain('edited the description')]
    case 'tag':
      return e.to ? [plain('added the tag '), strong(e.to.value)] : [plain('removed the tag '), strong(from ?? '')]
    case 'attachment':
      return e.to ? [plain('attached '), strong(e.to.value)] : [plain('removed the attachment '), strong(from ?? '')]
  }
}

/** The name an entry is attributed to, including an account deleted since. */
export function actorLabel(e: CardHistoryEvent): string {
  return e.actor?.name ?? e.actorName ?? 'Deleted user'
}

/** Each item carries its record under its own name, and `undefined` under the other's, so a template can destructure it. */
export type TimelineItem<C> = (
  | { kind: 'comment', key: string, comment: C, event?: undefined }
  | { kind: 'event', key: string, event: CardHistoryEvent, comment?: undefined }
) & {
  /** Whether a hairline separates this record from the one above it. */
  ruled: boolean
}

/**
 * Comments and changes in one list, by time.
 *
 * A merge rather than a sort, so the changes keep the server's order, which is
 * the order they were made in even where two share a millisecond or the clock
 * stepped back. Comments are stamped in whole seconds, so a change and a comment
 * in the same second cannot be told apart; the change goes first, which is what
 * keeps the creation at the top.
 *
 * Every record is ruled off from the one above, as the comment thread always
 * was, except a change following a change: a run of one-line changes is one
 * block, and a hairline under each would outweigh the lines themselves.
 */
export function mergeTimeline<C extends { id: string, createdAt: string }>(comments: C[], events: CardHistoryEvent[]): TimelineItem<C>[] {
  const second = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
  const items: TimelineItem<C>[] = []
  let c = 0
  let e = 0
  while (c < comments.length || e < events.length) {
    const event = events[e]
    const comment = comments[c]
    const prev = items[items.length - 1]
    if (event && (!comment || second(event.createdAt) <= second(comment.createdAt))) {
      items.push({ kind: 'event', key: `event-${event.id}`, event, ruled: !!prev && prev.kind !== 'event' })
      e++
    } else if (comment) {
      items.push({ kind: 'comment', key: `comment-${comment.id}`, comment, ruled: !!prev })
      c++
    }
  }
  return items
}

/** The panel's three views of a card's record. Every card opens on `comments`. */
export type TimelineTab = 'all' | 'comments' | 'activity'

/** What a tab lists: both, the comments alone, or the changes alone. */
export function timelineFor<C extends { id: string, createdAt: string }>(tab: TimelineTab, comments: C[], events: CardHistoryEvent[]): TimelineItem<C>[] {
  return mergeTimeline(tab === 'activity' ? [] : comments, tab === 'comments' ? [] : events)
}

/**
 * Whether a tab is still waiting for what it lists, so it says "Loading" rather
 * than an empty list. Each tab waits on its own data: changes already loaded
 * show on Activity while the comments are still on their way, and All shows
 * whichever has arrived.
 */
export function timelineLoading(tab: TimelineTab, state: { commentsLoading: boolean, commentCount: number, historyLoading: boolean, historyCount: number }): boolean {
  const comments = state.commentsLoading && !state.commentCount
  const history = state.historyLoading && !state.historyCount
  if (tab === 'comments') return comments
  if (tab === 'activity') return history
  return comments && history
}
