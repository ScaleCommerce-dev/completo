import { eq, and, isNull, notInArray, inArray } from 'drizzle-orm'

/**
 * Agents that could be added to this project, for the members list's "Add agent"
 * picker: active, not already members, and whose manager is a member here or is
 * an admin (the membership invariant, applied before the add rather than only
 * refused by it). Whoever can add members can ask: project owners and admins.
 *
 * Query: `q` (name or description).
 */
export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })
  const q = ((getQuery(event).q as string) || '').trim()

  const memberIds = db.select({ userId: schema.projectMembers.userId })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.projectId, project.id))
    .all()
    .map(r => r.userId)
  const memberSet = new Set(memberIds)

  const conditions = [
    eq(schema.users.kind, 'agent'),
    isNull(schema.users.suspendedAt)
  ]
  if (memberIds.length) conditions.push(notInArray(schema.users.id, memberIds))
  if (q) conditions.push(agentSearchCondition(q))

  const agents = db.select(memberRefColumns())
    .from(schema.users)
    .where(and(...conditions))
    .all()

  const managerIds = [...new Set(agents.map(a => a.managedById).filter(Boolean))] as string[]
  const managers = new Map(managerIds.length
    ? db.select({
        id: schema.users.id,
        kind: schema.users.kind,
        isAdmin: schema.users.isAdmin,
        canCreateAgents: schema.users.canCreateAgents,
        suspendedAt: schema.users.suspendedAt
      })
        .from(schema.users)
        .where(inArray(schema.users.id, managerIds))
        .all()
        .map(m => [m.id, m])
    : [])

  const { member } = createUserRefs(agents)
  return agents
    .filter((a) => {
      const manager = a.managedById ? managers.get(a.managedById) ?? null : null
      return !!manager && canManageAgents(manager) && agentMayJoinProject(manager, memberSet.has(manager.id))
    })
    .map(member)
    .sort((a, b) => (a.managedBy?.name ?? '').localeCompare(b.managedBy?.name ?? '') || a.name.localeCompare(b.name))
})
