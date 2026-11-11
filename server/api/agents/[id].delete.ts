import { eq } from 'drizzle-orm'

/**
 * Delete an agent. Its tokens and memberships go with it; its cards become
 * unassigned and its comments stay, as for a deleted person.
 */
export default defineEventHandler(async (event) => {
  const { user, agent } = await resolveManagedAgent(event)
  db.transaction(() => {
    recordAccountRemoval(agent, user)
    db.delete(schema.users).where(eq(schema.users.id, agent.id)).run()
  })
  return { ok: true }
})
