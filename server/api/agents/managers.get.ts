import { eq, and, or, isNull, inArray } from 'drizzle-orm'

/**
 * Who agents can be handed to: active people who are admins or allowed to
 * create agents. Admins only, for the transfer and hand-over pickers.
 *
 * With `agentIds` (comma-separated), each candidate also carries `removedFrom`:
 * the memberships those agents would lose by moving to that person, so the
 * picker can show the cost of each choice before one is made.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { agentIds: rawIds } = getQuery(event) as { agentIds?: string }
  const agentIds = (rawIds || '').split(',').map(s => s.trim()).filter(Boolean)

  const candidates = db.select({
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl,
    isAdmin: schema.users.isAdmin,
    canCreateAgents: schema.users.canCreateAgents
  })
    .from(schema.users)
    .where(and(
      eq(schema.users.kind, 'human'),
      isNull(schema.users.suspendedAt),
      or(eq(schema.users.isAdmin, 1), eq(schema.users.canCreateAgents, 1))
    ))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name))

  // Every membership of the agents in question, and of every non-admin candidate,
  // in two queries; the per-candidate cost is then computed in memory.
  const agentMemberships = agentIds.length
    ? db.select({
        agentId: schema.projectMembers.userId,
        agentName: schema.users.name,
        projectId: schema.projects.id,
        projectName: schema.projects.name
      })
        .from(schema.projectMembers)
        .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
        .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
        .where(and(inArray(schema.projectMembers.userId, agentIds), eq(schema.users.kind, 'agent')))
        .all()
    : []
  const nonAdminIds = candidates.filter(c => !c.isAdmin).map(c => c.id)
  const candidateProjects = new Map<string, Set<string>>()
  if (agentMemberships.length && nonAdminIds.length) {
    for (const row of db.select({ userId: schema.projectMembers.userId, projectId: schema.projectMembers.projectId })
      .from(schema.projectMembers)
      .where(inArray(schema.projectMembers.userId, nonAdminIds))
      .all()) {
      if (!candidateProjects.has(row.userId)) candidateProjects.set(row.userId, new Set())
      candidateProjects.get(row.userId)!.add(row.projectId)
    }
  }

  return candidates.map((c) => {
    const projectIds = candidateProjects.get(c.id) ?? new Set<string>()
    const removedFrom = agentMemberships.filter(m =>
      projectsLostOnTransfer([m.projectId], { isAdmin: c.isAdmin, projectIds }).length > 0
    )
    return {
      id: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl,
      isAdmin: !!c.isAdmin,
      canCreateAgents: !!c.canCreateAgents,
      removedFrom
    }
  })
})
