import { agentsTransferSchema } from '#shared/schemas/agent'

/** Hand several agents to one new manager. Admins only; see `[id]/transfer.post.ts`. */
export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const body = await readBodyAs(event, agentsTransferSchema)
  const agents = loadAgentsForBulk(body.agentIds)

  const ids = agents.map(a => a.id)
  const { manager, removedFrom, revokedTokens } = transferAgents(ids, body.toUserId, user, { dryRun: body.dryRun })
  return { agentIds: ids, managedBy: { id: manager.id, name: manager.name }, removedFrom, revokedTokens }
})
