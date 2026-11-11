import { randomBytes } from 'node:crypto'

/** Create an agent. The creator becomes its manager. */
export default defineEventHandler(async (event) => {
  const { user } = await requireAgentCreator(event)
  const body = await readBody<{ name?: unknown, description?: unknown, color?: unknown }>(event)
  const fields = readAgentFields(body ?? {}, { requireName: true })

  // The address is never mailed or shown where a person's would be, but `users.email`
  // is unique, so a clash on the short suffix is retried rather than surfaced.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = crypto.randomUUID()
    try {
      db.insert(schema.users).values({
        id,
        kind: 'agent',
        email: agentEmail(fields.name!, randomBytes(2).toString('hex')),
        name: fields.name!,
        description: fields.description ?? null,
        color: fields.color ?? null,
        passwordHash: AGENT_PASSWORD_HASH,
        managedById: user.id,
        isAdmin: 0,
        canCreateAgents: 0,
        emailNotifications: 0,
        // Nothing an agent does is gated on verification; set so no path reads it as
        // an unfinished sign-up.
        emailVerifiedAt: new Date()
      }).run()
      setResponseStatus(event, 201)
      return describeAgent(loadUserRow(id)!)
    } catch (err) {
      const message = (err as Error).message
      // Two creates racing past readAgentFields' check: the index is the backstop.
      if (message.includes('users_agent_name_lower_unique')) {
        throw createError({ statusCode: 409, message: `An agent called "${fields.name}" already exists` })
      }
      if (!/users_email_lower_unique|users\.email/.test(message)) throw err
    }
  }
  throw createError({ statusCode: 500, message: 'Could not allocate an address for the agent' })
})
