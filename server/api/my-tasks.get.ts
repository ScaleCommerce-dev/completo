import { eq, inArray, and, sql } from 'drizzle-orm'

const DEFAULT_COLUMNS = ['done', 'ticketId', 'title', 'status', 'priority', 'dueDate', 'tags']

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const userId = user.id

  // ─── Cards assigned to this user ───
  const myCards = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .leftJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(eq(schema.cards.assigneeId, userId))
    .all()
    .map(row => ({
      ...row.cards,
      assignee: row.users ? { id: row.users.id, name: row.users.name, avatarUrl: row.users.avatarUrl } : null,
      status: row.statuses ? { id: row.statuses.id, name: row.statuses.name, color: row.statuses.color } : null
    }))

  if (!myCards.length) {
    return {
      columns: await ensureColumns(userId),
      collapsedProjectIds: [],
      groups: []
    }
  }

  // ─── Only include projects where user is still a member ───
  const projectIds = [...new Set(myCards.map(c => c.projectId))]
  const memberships = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.userId, userId),
      inArray(schema.projectMembers.projectId, projectIds)
    ))
    .all()
  const memberProjectIds = new Set(memberships.map(m => m.projectId))

  // Also allow admin to see all their assigned cards
  const isAdmin = !!user.isAdmin
  const visibleCards = isAdmin
    ? myCards
    : myCards.filter(c => memberProjectIds.has(c.projectId))

  if (!visibleCards.length) {
    return {
      columns: await ensureColumns(userId),
      collapsedProjectIds: [],
      groups: []
    }
  }

  // ─── Bulk-fetch tags ───
  const cardIds = visibleCards.map(c => c.id)
  const allCardTags = db.select().from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .where(inArray(schema.cardTags.cardId, cardIds))
    .all()

  const tagsByCard = new Map<number, Array<{ id: string, name: string, color: string }>>()
  for (const row of allCardTags) {
    const cardId = row.card_tags.cardId
    if (!tagsByCard.has(cardId)) tagsByCard.set(cardId, [])
    tagsByCard.get(cardId)!.push({
      id: row.tags.id,
      name: row.tags.name,
      color: row.tags.color
    })
  }

  // ─── Bulk-fetch attachment counts ───
  const attachmentCounts = db.select({
    cardId: schema.attachments.cardId,
    count: sql<number>`count(*)`
  })
    .from(schema.attachments)
    .where(inArray(schema.attachments.cardId, cardIds))
    .groupBy(schema.attachments.cardId)
    .all()
  const attachCountByCard = new Map(attachmentCounts.map(r => [r.cardId, r.count]))

  // ─── Fetch projects, statuses ───
  const visibleProjectIds = [...new Set(visibleCards.map(c => c.projectId))]
  const allProjects = db.select().from(schema.projects)
    .where(inArray(schema.projects.id, visibleProjectIds))
    .all()
  const allStatuses = db.select().from(schema.statuses)
    .where(inArray(schema.statuses.projectId, visibleProjectIds))
    .all()

  // ─── Group by project ───
  const groups = allProjects.map((project) => {
    const projectStatuses = allStatuses.filter(s => s.projectId === project.id)

    // Filter out done cards past retention window
    let projectCards = visibleCards.filter(c => c.projectId === project.id)
    if (project.doneStatusId && project.doneRetentionDays != null) {
      const cutoff = Date.now() - project.doneRetentionDays * 86400000
      projectCards = projectCards.filter((card) => {
        if (card.statusId !== project.doneStatusId) return true
        return card.updatedAt.getTime() >= cutoff
      })
    }

    const cardsWithTags = projectCards.map(card => ({
      ...card,
      tags: tagsByCard.get(card.id) || [],
      attachmentCount: attachCountByCard.get(card.id) || 0
    }))

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        key: project.key,
        icon: project.icon,
        doneStatusId: project.doneStatusId,
        doneRetentionDays: project.doneRetentionDays
      },
      statuses: projectStatuses.map(s => ({ id: s.id, name: s.name, color: s.color })),
      cards: cardsWithTags
    }
  }).filter(g => g.cards.length > 0)

  // ─── User's column config + collapsed state ───
  const columns = await ensureColumns(userId)

  const collapsedRows = db.select().from(schema.myTasksCollapsed)
    .where(eq(schema.myTasksCollapsed.userId, userId))
    .all()
  const collapsedProjectIds = collapsedRows.map(r => r.projectId)

  return {
    columns,
    collapsedProjectIds,
    groups
  }
})

/** Lazy-seed default columns if user has none configured. */
function ensureColumns(userId: string) {
  let columns = db.select().from(schema.myTasksColumns)
    .where(eq(schema.myTasksColumns.userId, userId))
    .all()
    .sort((a, b) => a.position - b.position)

  if (!columns.length) {
    db.transaction(() => {
      for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
        db.insert(schema.myTasksColumns).values({
          userId,
          field: DEFAULT_COLUMNS[i]!,
          position: i
        }).run()
      }
    })
    columns = db.select().from(schema.myTasksColumns)
      .where(eq(schema.myTasksColumns.userId, userId))
      .all()
      .sort((a, b) => a.position - b.position)
  }

  return columns
}
