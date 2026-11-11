/** Suspend an agent and revoke every token it holds. Its manager or an admin. */
export default defineEventHandler(async (event) => {
  const { agent } = await resolveManagedAgent(event)
  return { ok: true, revokedTokens: suspendAgents([agent.id]) }
})
