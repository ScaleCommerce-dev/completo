import { eq } from 'drizzle-orm'

/** Rename an agent, or change its description or colour. Its manager or an admin. */
export default defineEventHandler(async (event) => {
  const { agent } = await resolveManagedAgent(event)
  const body = await readBody<{ name?: unknown, description?: unknown, color?: unknown }>(event)
  const fields = readAgentFields(body ?? {}, { requireName: false, exceptId: agent.id })

  if (!Object.keys(fields).length) {
    throw createError({ statusCode: 400, message: 'No valid fields to update' })
  }

  db.update(schema.users).set(fields).where(eq(schema.users.id, agent.id)).run()
  return describeAgent(loadUserRow(agent.id)!)
})
