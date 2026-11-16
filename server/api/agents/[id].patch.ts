import { eq } from 'drizzle-orm'
import { agentUpdateSchema } from '#shared/schemas/agent'

/** Rename an agent, or change its description or colour. Its manager or an admin. */
export default defineEventHandler(async (event) => {
  const { agent } = await resolveManagedAgent(event)
  const fields = await readBodyAs(event, agentUpdateSchema)
  if (fields.name !== undefined) assertAgentNameFree(fields.name, agent.id)

  db.update(schema.users).set(fields).where(eq(schema.users.id, agent.id)).run()
  return describeAgent(loadUserRow(agent.id)!)
})
