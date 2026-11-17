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

  // A suspended or deleted user's open tab must stop receiving, so every push
  // re-runs auth (`streamAppEvents`).
  return streamAppEvents(event, {
    select: evt => evt.type === 'notification' && evt.userId === user.id
      ? { event: 'notification', data: JSON.stringify(evt.payload ?? null) }
      : null,
    allowed: () => isStillAuthorized(event)
  })
})
