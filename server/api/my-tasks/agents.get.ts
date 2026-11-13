import { eq, and, inArray, isNull } from 'drizzle-orm'

/**
 * "My agents' work": cards assigned to the agents the caller manages, one flat
 * list across projects, each with its agent as `assignee` (`suspended` marks one
 * whose tokens are revoked) and its project. Only projects the caller can see
 * are included, and done cards past a project's retention are left out, as on
 * My Tasks itself. Not admin-elevated: it answers "my agents", not "all agents".
 *
 * `agentCount` counts every agent the caller manages and
 * `agentsWithCards` those holding at least one of these cards, for "16 cards, 9 of 24 agents".
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)

  const agents = db.select(memberRefColumns())
    .from(schema.users)
    .where(and(eq(schema.users.kind, 'agent'), eq(schema.users.managedById, user.id)))
    .all()

  if (!agents.length) return { agentCount: 0, agentsWithCards: 0, cards: [] }

  const rows = db.select().from(schema.cards)
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .leftJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(and(
      inArray(schema.cards.assigneeId, agents.map(a => a.id)),
      isNull(schema.cards.archivedAt),
      user.isAdmin
        ? undefined
        : inArray(schema.cards.projectId, db.select({ id: schema.projectMembers.projectId })
            .from(schema.projectMembers)
            .where(eq(schema.projectMembers.userId, user.id)))
    ))
    .all()
    .filter((row) => {
      const project = row.projects
      if (!project.doneStatusId || project.doneRetentionDays == null) return true
      if (row.cards.statusId !== project.doneStatusId) return true
      return row.cards.updatedAt.getTime() >= Date.now() - project.doneRetentionDays * 86400000
    })

  const { member } = createUserRefs(agents)
  const agentById = new Map(agents.map(a => [a.id, member(a)]))

  const cards = enrichCardsWithMetadata(rows.map(row => ({
    ...row.cards,
    assignee: agentById.get(row.cards.assigneeId!) ?? null,
    status: row.statuses ? { id: row.statuses.id, name: row.statuses.name, color: row.statuses.color } : null,
    project: {
      id: row.projects.id,
      name: row.projects.name,
      slug: row.projects.slug,
      key: row.projects.key,
      icon: row.projects.icon,
      doneStatusId: row.projects.doneStatusId
    }
  })), { userId: user.id })

  return {
    agentCount: agents.length,
    agentsWithCards: new Set(cards.map(c => c.assigneeId)).size,
    cards
  }
})
