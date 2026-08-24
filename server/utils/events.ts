import { EventEmitter } from 'node:events'

/**
 * In-process fan-out bus for live view updates.
 *
 * Completo is a single Nitro process over one SQLite file, so a plain
 * `EventEmitter` is the whole message broker: a mutation calls `emitProjectEvent`
 * and every open `/api/events` stream for that project pushes it to its browser.
 * There is deliberately no queue, no persistence and no cross-process transport —
 * a client that was disconnected when an event fired reconciles by refetching on
 * reconnect, not by replaying a log. If Completo ever runs more than one process,
 * this is the seam to swap for a real pub/sub, and nothing above it changes.
 *
 * One channel, filtered per subscriber by `projectId`, rather than a channel per
 * project: the connected-client count is small (one per open board/list tab), so
 * a string compare per event is cheaper than churning listener sets as projects
 * come and go, and it keeps `setMaxListeners` in one place.
 */
export type ProjectEventType = 'card.upsert' | 'card.delete' | 'view.invalidate'

export interface ProjectEvent {
  type: ProjectEventType
  projectId: string
  /** Present for `card.upsert` (the enriched card) and `card.delete` (`{ id }`). */
  payload?: unknown
}

const CHANNEL = 'project'

// The listener cap is a leak-detector tuned for a handful of route handlers, not
// for one-per-open-tab SSE subscribers. Disable it so a genuinely busy instance
// does not spew MaxListenersExceededWarning; leaks are caught by the onClosed
// cleanup in the endpoint instead.
const emitter = new EventEmitter()
emitter.setMaxListeners(0)

export function emitProjectEvent(evt: ProjectEvent): void {
  emitter.emit(CHANNEL, evt)
}

/**
 * Subscribe to every project event. Returns an unsubscribe function — the SSE
 * endpoint calls it from `onClosed`, which is the only thing keeping the listener
 * set from growing without bound as tabs open and close.
 */
export function subscribeProjectEvents(handler: (evt: ProjectEvent) => void): () => void {
  emitter.on(CHANNEL, handler)
  return () => emitter.off(CHANNEL, handler)
}
