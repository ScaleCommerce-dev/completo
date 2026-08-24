import { createEventStream } from 'h3'

/**
 * Server-sent event stream for one project's live view updates.
 *
 * The browser opens `EventSource('/api/events?projectId=…')` for the board or
 * list it is showing; the session cookie rides along automatically (EventSource
 * cannot set an Authorization header, which is fine — live updates are a browser
 * feature, and API-token clients like the CLI poll instead). Membership is
 * checked once at connect: a non-member gets the same 404 the view GET gives, so
 * the id of a project you cannot see never even confirms it exists.
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

  const unsubscribe = subscribeAppEvents((evt) => {
    if (evt.projectId !== projectId) return
    stream.push({ event: evt.type, data: JSON.stringify(evt.payload ?? null) }).catch(() => {
      // A push after the socket dropped but before onClosed ran throws; the
      // cleanup below is what actually reclaims the listener.
    })
  })

  // Heartbeat: a named event the client never listens for keeps idle
  // intermediaries from reaping the connection. It also surfaces a half-open
  // socket as a push failure, which trips onClosed and cleans up rather than
  // leaking a listener per dead tab.
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
