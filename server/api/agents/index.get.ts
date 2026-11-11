import { eq, and, isNull, isNotNull, sql, type SQL } from 'drizzle-orm'

/**
 * Agents the caller may manage. Everyone sees the agents they manage; an admin
 * can ask for every agent (`scope=all`) and narrow by manager, including
 * `managerId=none` for the ones whose manager is gone.
 *
 * Query: `scope` (mine | all), `managerId` (a user id, or `none`), `status`
 * (active | suspended), `q` (name or description).
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const query = getQuery(event) as { scope?: string, managerId?: string, status?: string, q?: string }

  const conditions: SQL[] = [eq(schema.users.kind, 'agent')]

  const all = query.scope === 'all' || (query.managerId !== undefined && query.managerId !== user.id)
  if (all && !user.isAdmin) {
    throw createError({ statusCode: 403, message: 'Only admins can list other people\'s agents' })
  }
  if (!all) {
    conditions.push(eq(schema.users.managedById, user.id))
  } else if (query.managerId === 'none') {
    conditions.push(isNull(schema.users.managedById))
  } else if (query.managerId) {
    conditions.push(eq(schema.users.managedById, query.managerId))
  }

  if (query.status === 'active') conditions.push(isNull(schema.users.suspendedAt))
  else if (query.status === 'suspended') conditions.push(isNotNull(schema.users.suspendedAt))
  else if (query.status !== undefined && query.status !== '') {
    throw createError({ statusCode: 400, message: 'status must be "active" or "suspended"' })
  }

  const q = (query.q || '').trim()
  if (q) conditions.push(agentSearchCondition(q))

  const agents = db.select().from(schema.users)
    .where(and(...conditions))
    .orderBy(sql`lower(${schema.users.name})`)
    .all()

  return describeAgents(agents)
})
