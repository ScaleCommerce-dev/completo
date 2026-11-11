import { eq } from 'drizzle-orm'

/**
 * Wake a suspended agent. It has no tokens (suspending revoked them), so it can
 * do nothing until one is generated. Refused while it has no manager, or one who
 * can no longer manage agents: waking it would hand an active agent to nobody.
 *
 * Waking it also re-applies the membership invariant against its manager as they
 * are now, so a suspended agent left in a project its manager is not in never
 * comes back to it, however that state was reached.
 */
export default defineEventHandler(async (event) => {
  const { user, agent } = await resolveManagedAgent(event)

  const manager = agent.managedById ? loadUserRow(agent.managedById) : null
  if (!manager) {
    throw createError({ statusCode: 409, message: 'This agent has no manager. An admin has to transfer it first.' })
  }
  if (!canManageAgents(manager)) {
    throw createError({ statusCode: 409, message: `${manager.name} can no longer manage agents. An admin has to transfer it first.` })
  }

  const removedFrom = pruneAgentMemberships([agent.id], manager, user)
  db.update(schema.users).set({ suspendedAt: null }).where(eq(schema.users.id, agent.id)).run()
  return { ok: true, removedFrom }
})
