/**
 * Suspend several agents at once. An admin, or the manager of every one of
 * them; an id the caller does not manage reads as not found.
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const body = await readBody<{ agentIds?: unknown }>(event)
  const agents = loadAgentsForBulk(body?.agentIds)

  if (!user.isAdmin && agents.some(a => a.managedById !== user.id)) {
    throw createError({ statusCode: 404, message: 'Agent not found' })
  }

  const ids = agents.map(a => a.id)
  return { agentIds: ids, revokedTokens: suspendAgents(ids) }
})
