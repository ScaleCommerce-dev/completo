import { desc, eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user } = await requireAdmin(event)

  const users = db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl,
    isAdmin: schema.users.isAdmin,
    canCreateAgents: schema.users.canCreateAgents,
    suspendedAt: schema.users.suspendedAt,
    lastSeenAt: schema.users.lastSeenAt,
    createdAt: schema.users.createdAt,
    passwordHash: schema.users.passwordHash,
    emailVerifiedAt: schema.users.emailVerifiedAt
  })
    .from(schema.users)
    // Agents have their own page; this one is people.
    .where(eq(schema.users.kind, 'human'))
    .orderBy(desc(schema.users.createdAt))
    .all()

  // How many agents each person manages, and how many of those are active: a
  // non-zero active count is what makes removing their permission a hand-over.
  const counts = new Map(db.select({
    managerId: schema.users.managedById,
    total: sql<number>`count(*)`,
    active: sql<number>`sum(case when ${schema.users.suspendedAt} is null then 1 else 0 end)`
  })
    .from(schema.users)
    .where(and(eq(schema.users.kind, 'agent'), sql`${schema.users.managedById} is not null`))
    .groupBy(schema.users.managedById)
    .all()
    .map(r => [r.managerId!, r]))

  return users.map(({ passwordHash, emailVerifiedAt, canCreateAgents, ...rest }) => ({
    ...rest,
    canCreateAgents: !!canCreateAgents,
    agentCount: counts.get(rest.id)?.total ?? 0,
    activeAgentCount: counts.get(rest.id)?.active ?? 0,
    pendingSetup: passwordHash === '!invited' && !emailVerifiedAt
  }))
})
