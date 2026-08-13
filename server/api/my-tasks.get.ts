import { eq, inArray, and } from 'drizzle-orm'

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

  const visibleCards = myCards.filter(c => memberProjectIds.has(c.projectId))

  if (!visibleCards.length) {
    return {
      columns: await ensureColumns(userId),
      collapsedProjectIds: [],
      groups: []
    }
  }

  // ─── Bulk-fetch tags, attachment counts & creators ───
  const { tagsByCard, attachCountByCard, commentCountByCard } = fetchCardMetadata(visibleCards.map(c => c.id))
  const creatorsById = fetchCardCreators(visibleCards)

  // ─── Fetch projects, statuses ───
  const visibleProjectIds = [...new Set(visibleCards.map(c => c.projectId))]
  const allProjects = db.select().from(schema.projects)
    .where(inArray(schema.projects.id, visibleProjectIds))
    .all()
  const allStatuses = db.select().from(schema.statuses)
    .where(inArray(schema.statuses.projectId, visibleProjectIds))
    .all()

  // Tags and members per project, so My Tasks can edit the same fields a
  // project's own list view can. Without them the tag and assignee cells fall
  // back to read-only and the page renders the same table with fewer controls.
  const allTags = db.select().from(schema.tags)
    .where(inArray(schema.tags.projectId, visibleProjectIds))
    .all()
  const allMembers = db.select({
    projectId: schema.projectMembers.projectId,
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(inArray(schema.projectMembers.projectId, visibleProjectIds))
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
      attachmentCount: attachCountByCard.get(card.id) || 0,
      commentCount: commentCountByCard.get(card.id) || 0,
      creator: card.createdById ? creatorsById.get(card.createdById) || null : null
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
      tags: allTags.filter(t => t.projectId === project.id).map(t => ({ id: t.id, name: t.name, color: t.color })),
      members: allMembers.filter(m => m.projectId === project.id).map(m => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl })),
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
      for (let i = 0; i < MY_TASKS_DEFAULT_FIELDS.length; i++) {
        db.insert(schema.myTasksColumns).values({
          userId,
          field: MY_TASKS_DEFAULT_FIELDS[i]!,
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
