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

  const unsubscribe = subscribeAppEvents((evt) => {
    if (evt.type !== 'notification' || evt.userId !== user.id) return
    stream.push({ event: 'notification', data: JSON.stringify(evt.payload ?? null) }).catch(() => {})
  })

  const heartbeat = setInterval(() => {
    stream.push({ event: 'ping', data: '1' }).catch(() => {})
  }, 25_000)

  stream.onClosed(async () => {
    clearInterval(heartbeat)
    unsubscribe()
    await stream.close()
  })

  return stream.send()
})
