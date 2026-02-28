import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, list, membership } = await resolveList(event, { columnAccess: false })

  // Fetch list creator info
  const createdBy = list.createdById
    ? db.select({ id: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
      .from(schema.users)
      .where(eq(schema.users.id, list.createdById))
      .get() || null
    : null

  // Fetch list columns
  const columns = db.select()
    .from(schema.listColumns)
    .where(eq(schema.listColumns.listId, list.id))
    .all()
    .sort((a, b) => a.position - b.position)

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, list.projectId))
    .get()

  // Fetch ALL project cards (not filtered by board columns)
  const allProjectCards = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .leftJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(eq(schema.cards.projectId, list.projectId))
    .all()
    .map(row => ({
      ...row.cards,
      assignee: row.users ? { id: row.users.id, name: row.users.name, avatarUrl: row.users.avatarUrl } : null,
      status: row.statuses ? { id: row.statuses.id, name: row.statuses.name, color: row.statuses.color } : null
    }))

  // Filter out done cards past retention window
  let cards = allProjectCards
  if (project?.doneStatusId && project.doneRetentionDays != null) {
    const cutoff = Date.now() - project.doneRetentionDays * 86400000
    cards = allProjectCards.filter((card) => {
      if (card.statusId !== project.doneStatusId) return true
      return card.updatedAt.getTime() >= cutoff
    })
  }

  const cardsWithTags = enrichCardsWithMetadata(cards)

  // Fetch project-level tags
  const projectTags = db.select().from(schema.tags)
    .where(eq(schema.tags.projectId, list.projectId))
    .all()

  // Fetch project statuses
  const statuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, list.projectId))
    .all()

  const members = db.select({
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(eq(schema.projectMembers.projectId, list.projectId))
    .all()

  return {
    ...list,
    tagFilters: safeParseJson(list.tagFilters, []),
    createdBy,
    role: membership.role,
    project: project ? { id: project.id, name: project.name, slug: project.slug, key: project.key, doneStatusId: project.doneStatusId, doneRetentionDays: project.doneRetentionDays } : null,
    columns,
    cards: cardsWithTags,
    members,
    statuses,
    tags: projectTags
  }
})
