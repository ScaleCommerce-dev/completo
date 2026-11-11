import { createEventStream } from 'h3'

/**
 * Server-sent event stream for one project's live view updates.
 *
 * The browser opens `EventSource('/api/events?projectId=…')` for the board or
 * list it is showing; the session cookie rides along automatically (EventSource
 * cannot set an Authorization header, but a non-browser client can send a Bearer
 * token, and `resolveAuth` accepts it). A non-member gets the same 404 the view
 * GET gives at connect, so the id of a project you cannot see never even confirms
 * it exists; after that, every push re-checks (below).
 *
 * Each event is named (`card.upsert` / `card.delete` / `view.invalidate`) so the
 * client wires one `addEventListener` per kind rather than switching on a field.
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { projectId } = getQuery(event) as { projectId?: string }

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'projectId is required' })
  }

  try {
    requireProjectMember(projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  // Reverse proxies buffer responses by default, which holds events until the
  // connection closes and defeats the point. This is the standard opt-out.
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const stream = createEventStream(event)

  // Connect-time membership is not enough: a stream held open across a removal,
  // a suspension, a revoked token or a lost admin flag kept receiving every card
  // row in the project. So each push re-asks, and a failed check ends the stream.
  // The chain keeps pushes in emit order while each awaits its check.
  const allowed = () => isStillAuthorized(event, u => requireProjectMember(projectId, u.id, { isAdmin: u.isAdmin }))
  let chain = Promise.resolve()
  const send = (msg: { event: string, data: string }) => {
    chain = chain.then(async () => {
      if (!(await allowed())) return cleanup()
      await stream.push(msg)
    }).catch(() => {
      // A push after the socket dropped but before onClosed ran throws; the
      // cleanup below is what actually reclaims the listener.
    })
  }

  const unsubscribe = subscribeAppEvents((evt) => {
    if (evt.projectId !== projectId) return
    send({ event: evt.type, data: JSON.stringify(evt.payload ?? null) })
  })

  // Heartbeat: a named event the client never listens for keeps idle
  // intermediaries from reaping the connection. It also surfaces a half-open
  // socket as a push failure, which trips onClosed and cleans up rather than
  // leaking a listener per dead tab — and, going through the same check, closes
  // a revoked stream even in a project nobody is editing.
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
