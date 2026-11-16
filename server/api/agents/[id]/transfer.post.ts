import { agentTransferSchema } from '#shared/schemas/agent'

/**
 * Hand one agent to a new manager. Admins only. The response names every
 * project the agent left because the new manager is not in it; `dryRun` returns
 * that without changing anything.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const [agent] = loadAgentsForBulk([id])
  const body = await readBodyAs(event, agentTransferSchema)

  const { manager, removedFrom } = transferAgents([agent!.id], body.toUserId, user, { dryRun: body.dryRun })
  return { agentIds: [agent!.id], managedBy: { id: manager.id, name: manager.name }, removedFrom }
})
