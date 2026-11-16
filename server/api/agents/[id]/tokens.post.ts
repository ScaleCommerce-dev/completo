import { tokenCreateSchema } from '#shared/schemas/auth'

/**
 * Generate an API token for an agent. The raw token is in this response and
 * nowhere else. Its manager or an admin: an agent has no session, and
 * `POST /api/user/tokens` stays session-only, so it can never mint its own.
 */
export default defineEventHandler(async (event) => {
  const { agent } = await resolveManagedAgent(event)

  if (agent.suspendedAt) {
    throw createError({ statusCode: 409, message: 'Unsuspend the agent before generating a token' })
  }

  const { name, expiresInDays } = await readBodyAs(event, tokenCreateSchema)

  const token = mintApiToken(agent.id, { name, expiresInDays })
  setResponseStatus(event, 201)
  return token
})
