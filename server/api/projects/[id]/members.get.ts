import { eq, and, isNull, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project, user, membership } = await resolveProject(event)

  const members = db.select({
    ...memberRefColumns(),
    email: schema.users.email,
    isAdmin: schema.users.isAdmin,
    role: schema.projectMembers.role
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(eq(schema.projectMembers.projectId, project.id))
    .all()

  // How many cards each agent holds here: removing an agent, or the person who
  // manages it, unassigns them, and the confirmation says how many.
  const agentCards = new Map(db.select({ assigneeId: schema.cards.assigneeId, count: sql<number>`count(*)` })
    .from(schema.cards)
    .innerJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(and(eq(schema.cards.projectId, project.id), eq(schema.users.kind, 'agent'), isNull(schema.cards.archivedAt)))
    .groupBy(schema.cards.assigneeId)
    .all()
    .map(r => [r.assigneeId!, r.count]))

  const { member } = createUserRefs(members)
  return members.map(m => ({
    ...member(m),
    // An agent's address is synthetic and is not shown where a person's is. The one
    // exception is the agent asking about itself, which is how the CLI's `--me`
    // finds it (COMPLETO_USER is matched against this field).
    email: m.kind === 'agent' && m.id !== user.id ? null : m.email,
    role: m.role,
    // Removing an admin keeps their agents here, so the remove confirmation has to
    // know who is one; only whoever can remove people (owners, admins) is told.
    ...(membership.role === 'owner' ? { isAdmin: m.kind === 'human' && !!m.isAdmin } : {}),
    assignedCardCount: m.kind === 'agent' ? agentCards.get(m.id) ?? 0 : null
  }))
})
