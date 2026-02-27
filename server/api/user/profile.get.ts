import { eq, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const userId = user.id

  const userRecord = db.select({
    createdAt: schema.users.createdAt,
    lastSeenAt: schema.users.lastSeenAt
  }).from(schema.users).where(eq(schema.users.id, userId)).get()

  if (!userRecord) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Get user's project memberships
  const memberships = db.select()
    .from(schema.projectMembers)
    .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
    .where(eq(schema.projectMembers.userId, userId))
    .all()

  const projects = memberships.map(m => ({
    id: m.projects.id,
    name: m.projects.name,
    slug: m.projects.slug,
    key: m.projects.key,
    icon: m.projects.icon,
    doneStatusId: m.projects.doneStatusId,
    role: m.project_members.role
  }))

  // Build done-status lookup
  const doneStatusIds = new Set(
    projects.filter(p => p.doneStatusId).map(p => p.doneStatusId!)
  )

  // Get all cards assigned to this user across their projects
  const assignedCards = db.select({
    priority: schema.cards.priority,
    statusId: schema.cards.statusId
  }).from(schema.cards)
    .where(eq(schema.cards.assigneeId, userId))
    .all()

  // Count by priority, excluding done-status cards
  const priorityCounts: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 }
  let totalOpen = 0
  for (const card of assignedCards) {
    if (doneStatusIds.has(card.statusId)) continue
    const p = card.priority || 'medium'
    priorityCounts[p] = (priorityCounts[p] || 0) + 1
    totalOpen++
  }

  // Count open cards per project (for project list)
  const projectIds = projects.map(p => p.id)
  const openCardsByProject: Map<string, number> = new Map()
  if (projectIds.length > 0) {
    const allProjectCards = db.select({
      projectId: schema.cards.projectId,
      statusId: schema.cards.statusId
    }).from(schema.cards)
      .where(inArray(schema.cards.projectId, projectIds))
      .all()

    for (const card of allProjectCards) {
      if (doneStatusIds.has(card.statusId)) continue
      openCardsByProject.set(card.projectId, (openCardsByProject.get(card.projectId) || 0) + 1)
    }
  }

  return {
    createdAt: userRecord.createdAt?.toISOString() ?? null,
    lastSeenAt: userRecord.lastSeenAt?.toISOString() ?? null,
    priorityCounts,
    totalOpen,
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      key: p.key,
      icon: p.icon,
      role: p.role,
      openCards: openCardsByProject.get(p.id) || 0
    }))
  }
})
