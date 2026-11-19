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
  const { projectId, scope } = getQuery(event) as { projectId?: string, scope?: string }

  // Every project the caller is a member of, for a timeline board, which shows
  // cards from all of them. Membership is read again for each event rather than
  // once at connect, so a project left or joined meanwhile is honoured.
  if (scope === 'mine') {
    return streamAppEvents(event, {
      select: evt => evt.projectId && memberProjectIds(user.id).has(evt.projectId)
        ? { event: evt.type, data: JSON.stringify(evt.payload ?? null) }
        : null,
      allowed: () => isStillAuthorized(event)
    })
  }

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'projectId is required' })
  }

  try {
    requireProjectMember(projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  // Connect-time membership is not enough, so every push re-asks (`streamAppEvents`).
  return streamAppEvents(event, {
    select: evt => evt.projectId === projectId ? { event: evt.type, data: JSON.stringify(evt.payload ?? null) } : null,
    allowed: () => isStillAuthorized(event, u => requireProjectMember(projectId, u.id, { isAdmin: u.isAdmin }))
  })
})
