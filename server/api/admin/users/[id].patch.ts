import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)

  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ suspended?: boolean, isAdmin?: boolean, canCreateAgents?: boolean }>(event)

  if (id === user.id) {
    throw createError({ statusCode: 400, message: 'Cannot modify yourself' })
  }

  const targetUser = db.select().from(schema.users).where(eq(schema.users.id, id)).get()
  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // An agent is never an admin and never manages agents; suspending one also has to
  // revoke its tokens. All of that lives under /api/agents.
  if (targetUser.kind === 'agent') {
    throw createError({ statusCode: 400, message: 'Agents are managed under /api/agents' })
  }

  const updates: Record<string, Date | number | null> = {}

  if (typeof body.suspended === 'boolean') {
    updates.suspendedAt = body.suspended ? new Date() : null
  }

  if (typeof body.isAdmin === 'boolean') {
    updates.isAdmin = body.isAdmin ? 1 : 0
  }

  if (typeof body.canCreateAgents === 'boolean') {
    updates.canCreateAgents = body.canCreateAgents ? 1 : 0
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No valid fields to update' })
  }

  // The person as they would be after this change. Losing the ability to manage
  // agents (suspended, demoted without the permission, or the permission revoked)
  // while still managing active ones would strand them, so that needs a hand-over
  // first. An admin who loses admin keeps their agents, suspended ones included,
  // only in projects they are themselves a member of, whatever else changes: a
  // suspended agent left in a foreign project would be back in it once woken.
  // Regaining the ability to manage agents applies the same rule, so it holds
  // however the agents got where they are.
  const after = { ...targetUser, ...updates } as typeof targetUser
  const pruneToOwnProjects = !after.isAdmin
    && (!!targetUser.isAdmin || (!canManageAgents(targetUser) && canManageAgents(after)))
  if (canManageAgents(targetUser) && !canManageAgents(after)) {
    assertNoActiveAgents(targetUser)
  }

  db.update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, id))
    .run()

  if (pruneToOwnProjects) {
    const removedFrom = pruneAgentMemberships(agentsOf(id).map(a => a.id), { id, isAdmin: 0 }, user)
    return { ok: true, removedFrom }
  }

  return { ok: true }
})
