import { and, eq, inArray, isNull, notInArray, or } from 'drizzle-orm'

/**
 * Issues across every project the caller can read: `view=active` (open work
 * that is not backlog), `backlog`, or `all`; optionally one `projectId`. Each
 * row carries what an issue list row shows: project, status with category,
 * assignee, milestone, parent, sub-issue progress and relation counts.
 *
 * Archived issues are left out. `archived=include` adds them back, for a client
 * that resolves ticket references and must still find an archived one.
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { view = 'active', projectId, archived } = getQuery(event) as { view?: string, projectId?: string, archived?: string }
  if (!['active', 'backlog', 'all'].includes(view)) {
    throw createError({ statusCode: 400, message: 'view must be active, backlog or all' })
  }

  const visible = [...visibleProjectIds(user)]
  const projectIds = projectId ? visible.filter(p => p === projectId) : visible
  if (projectId && projectIds.length === 0) throw createError({ statusCode: 404, message: 'Project not found' })
  if (projectIds.length === 0) return []

  const categoryFilter = view === 'active'
    ? notInArray(schema.statuses.category, ['backlog', ...CLOSED_CATEGORIES])
    : view === 'backlog' ? eq(schema.statuses.category, 'backlog') : undefined

  const rows = db.select({
    card: schema.cards,
    status: { id: schema.statuses.id, name: schema.statuses.name, category: schema.statuses.category, color: schema.statuses.color, position: schema.statuses.position },
    project: { id: schema.projects.id, name: schema.projects.name, slug: schema.projects.slug, key: schema.projects.key, icon: schema.projects.icon },
    assignee: userRefColumns()
  })
    .from(schema.cards)
    .innerJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(and(inArray(schema.cards.projectId, projectIds), categoryFilter, archived === 'include' ? undefined : isNull(schema.cards.archivedAt)))
    .all()

  const ids = rows.map(r => r.card.id)
  const relations = ids.length
    ? db.select().from(schema.cardRelations).where(and(
        eq(schema.cardRelations.type, 'blocks'),
        or(inArray(schema.cardRelations.fromCardId, ids), inArray(schema.cardRelations.toCardId, ids))
      )).all()
    : []
  const blocking = new Map<number, number>()
  const blockedBy = new Map<number, number>()
  for (const r of relations) {
    blocking.set(r.fromCardId, (blocking.get(r.fromCardId) ?? 0) + 1)
    blockedBy.set(r.toCardId, (blockedBy.get(r.toCardId) ?? 0) + 1)
  }
  const progress = childProgress(ids)
  const milestones = new Map(db.select({ id: schema.milestones.id, name: schema.milestones.name }).from(schema.milestones)
    .where(inArray(schema.milestones.projectId, projectIds)).all().map(m => [m.id, m]))
  const { ref } = createUserRefs(rows.map(r => r.assignee?.id ? r.assignee : null))

  return rows.map(r => ({
    ...r.card,
    ticket: `${r.project.key}-${r.card.id}`,
    status: r.status,
    project: r.project,
    assignee: r.assignee?.id ? ref(r.assignee) : null,
    milestone: r.card.milestoneId ? milestones.get(r.card.milestoneId) ?? null : null,
    blockingCount: blocking.get(r.card.id) ?? 0,
    blockedByCount: blockedBy.get(r.card.id) ?? 0,
    childProgress: progress.get(r.card.id) ?? null
  }))
})
