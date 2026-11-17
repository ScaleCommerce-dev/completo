import { EventEmitter } from 'node:events'
import { createEventStream, type H3Event } from 'h3'

/**
 * In-process fan-out bus for live updates: board/list view changes (scoped by
 * `projectId`) and per-user notifications (scoped by `userId`).
 *
 * Completo is a single Nitro process over one SQLite file, so a plain
 * `EventEmitter` is the whole message broker: a mutation emits, and every open
 * SSE stream that matches the scope pushes it to its browser. There is
 * deliberately no queue, no persistence and no cross-process transport — a
 * client that was disconnected when an event fired reconciles by refetching on
 * reconnect, not by replaying a log. If Completo ever runs more than one process,
 * this is the seam to swap for a real pub/sub, and nothing above it changes.
 *
 * One channel, filtered per subscriber, rather than a channel per project/user:
 * the connected-client count is small (one per open board/list tab, one per
 * signed-in tab for notifications), so a field compare per event is cheaper than
 * churning listener sets, and it keeps `setMaxListeners` in one place.
 */
// View-stream events (scoped by projectId): `card.upsert` (a card's row changed),
// `card.delete` (a card was removed), `card.activity` (a foreign comment landed,
// which drives the unread dot), `view.invalidate` (a structural change a row patch
// cannot express). User-stream event (scoped by userId): `notification`.
export type AppEventType = 'card.upsert' | 'card.delete' | 'card.activity' | 'view.invalidate' | 'notification'

export interface AppEvent {
  type: AppEventType
  /** Set on view-stream events; the SSE view endpoint matches on it. */
  projectId?: string
  /** Set on user-stream events; the notification endpoint matches on it. */
  userId?: string
  payload?: unknown
}

const CHANNEL = 'app'

// The listener cap is a leak-detector tuned for a handful of route handlers, not
// for one-per-open-tab SSE subscribers. Disable it so a genuinely busy instance
// does not spew MaxListenersExceededWarning; leaks are caught by the onClosed
// cleanup in the endpoints instead.
const emitter = new EventEmitter()
emitter.setMaxListeners(0)

/** Emit a view-stream event, scoped to a project. */
export function emitProjectEvent(evt: { type: AppEventType, projectId: string, payload?: unknown }): void {
  emitter.emit(CHANNEL, evt as AppEvent)
}

/** Emit a user-stream event (a notification), scoped to one user. */
export function emitUserEvent(userId: string, type: AppEventType, payload?: unknown): void {
  emitter.emit(CHANNEL, { type, userId, payload } as AppEvent)
}

/**
 * Subscribe to every app event. Returns an unsubscribe function — the SSE
 * endpoints call it from `onClosed`, which is the only thing keeping the listener
 * set from growing without bound as tabs open and close.
 */
export function subscribeAppEvents(handler: (evt: AppEvent) => void): () => void {
  emitter.on(CHANNEL, handler)
  return () => emitter.off(CHANNEL, handler)
}

/**
 * Serve the bus to one client as server-sent events: the project view stream
 * and the notification stream, which each had this scaffolding in full.
 *
 * `select` picks the events for this client and names them. Every push re-runs
 * `allowed` first and ends the stream when it fails: connect-time auth is not
 * enough, since a stream held open across a removal, a suspension or a revoked
 * token kept receiving. Pushes are chained so they stay in emit order while each
 * awaits its check. A 25s heartbeat, a named event no client listens for, keeps
 * idle proxies from reaping the connection and surfaces a half-open socket as a
 * push failure, which ends in the same cleanup. `X-Accel-Buffering: no` is the
 * standard opt-out of reverse-proxy buffering, which would hold every event until
 * the connection closed.
 */
export function streamAppEvents(
  event: H3Event,
  opts: {
    select: (evt: AppEvent) => { event: string, data: string } | null
    allowed: () => Promise<boolean>
  }
) {
  setResponseHeader(event, 'X-Accel-Buffering', 'no')
  const stream = createEventStream(event)

  let chain = Promise.resolve()
  const send = (msg: { event: string, data: string }) => {
    chain = chain.then(async () => {
      if (!(await opts.allowed())) return cleanup()
      await stream.push(msg)
    }).catch(() => {
      // A push after the socket dropped but before onClosed ran throws; the
      // cleanup below is what actually reclaims the listener.
    })
  }

  const unsubscribe = subscribeAppEvents((evt) => {
    const msg = opts.select(evt)
    if (msg) send(msg)
  })
  const heartbeat = setInterval(() => send({ event: 'ping', data: '1' }), 25_000)

  // Shared by a dropped socket and a failed re-check, which ends the stream from
  // our side; running it twice is harmless.
  async function cleanup() {
    clearInterval(heartbeat)
    unsubscribe()
    await stream.close()
  }
  stream.onClosed(cleanup)

  return stream.send()
}
