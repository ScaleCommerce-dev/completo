/** Hand several agents to one new manager. Admins only; see `[id]/transfer.post.ts`. */
export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const body = await readBody<{ agentIds?: unknown, toUserId?: string, dryRun?: boolean }>(event)
  const agents = loadAgentsForBulk(body?.agentIds)

  if (!body?.toUserId) {
    throw createError({ statusCode: 400, message: 'toUserId is required' })
  }

  const ids = agents.map(a => a.id)
  const { manager, removedFrom } = transferAgents(ids, body.toUserId, user, { dryRun: body.dryRun })
  return { agentIds: ids, managedBy: { id: manager.id, name: manager.name }, removedFrom }
})
