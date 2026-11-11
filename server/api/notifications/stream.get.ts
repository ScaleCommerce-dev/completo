import { createEventStream } from 'h3'

/**
 * Server-sent event stream of the signed-in user's notifications.
 *
 * The app shell opens one `EventSource('/api/notifications/stream')` for the
 * whole session (see `useNotificationStream`); the cookie authenticates it. Every
 * `createNotification` emits a `notification` event, and this forwards the ones
 * addressed to this user, so the bell count and a toast appear the instant the
 * event happens instead of on the 30s poll. The poll stays as a fallback for a
 * dropped connection.
 *
 * Only `notification` events are forwarded — view events (card.*) share the bus
 * but carry no `userId`, so they never match here.
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)

  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const stream = createEventStream(event)

  // Same rule as the project view stream: a suspended or deleted user's open tab
  // must stop receiving, so every push re-runs auth and a failure ends the stream.
  let chain = Promise.resolve()
  const send = (msg: { event: string, data: string }) => {
    chain = chain.then(async () => {
      if (!(await isStillAuthorized(event))) return cleanup()
      await stream.push(msg)
    }).catch(() => {})
  }

  const unsubscribe = subscribeAppEvents((evt) => {
    if (evt.type !== 'notification' || evt.userId !== user.id) return
    send({ event: 'notification', data: JSON.stringify(evt.payload ?? null) })
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
})
