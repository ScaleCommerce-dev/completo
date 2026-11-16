import { handOverSchema } from '#shared/schemas/admin'

/**
 * Hand over every agent a person manages, before that person is deleted,
 * suspended or loses the right to manage agents: transfer them all to one new
 * manager, or suspend them all. Covers suspended agents too, so nothing is left
 * pointing at a manager who is about to go.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const person = loadUserRow(id)
  if (!person || person.kind !== 'human') {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const body = await readBodyAs(event, handOverSchema)
  const agentIds = agentsOf(id).map(a => a.id)

  if (body.action === 'suspend') {
    if (body.dryRun) return { agentIds, revokedTokens: 0 }
    return { agentIds, revokedTokens: suspendAgents(agentIds) }
  }

  // `handOverSchema` has made sure a transfer names someone.
  if (body.toUserId === id) {
    throw createError({ statusCode: 400, message: 'Choose someone else to take the agents over' })
  }
  const { manager, removedFrom } = transferAgents(agentIds, body.toUserId!, user, { dryRun: body.dryRun })
  return { agentIds, manager: { id: manager.id, name: manager.name }, removedFrom }
})
