import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const userId = user.id

  // Boards query deferred until we know the user's projectIds

  let projects: Array<{
    project: typeof schema.projects.$inferSelect
    role: string
  }>

  if (user.isAdmin) {
    const allProjects = db.select().from(schema.projects).all()
    const memberships = db.select()
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.userId, userId))
      .all()
    const membershipMap = new Map(memberships.map(m => [m.projectId, m.role]))
    projects = allProjects.map(p => ({
      project: p,
      role: membershipMap.get(p.id) || 'admin'
    }))
  } else {
    const memberships = db.select()
      .from(schema.projectMembers)
      .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
      .where(eq(schema.projectMembers.userId, userId))
      .all()
    projects = memberships.map(m => ({
      project: m.projects,
      role: m.project_members.role
    }))
  }

  if (projects.length === 0) return []

  // Alphabetical, case- and accent-insensitive, with numbers in numeric order.
  // There was no ORDER BY at all, so the sidebar and the projects grid showed
  // insertion order for admins and join order for everyone else — which read as
  // random. A plain `<` sort would not fix it: it puts every lower-case name
  // ("smoxy", "zdev") after every capitalised one.
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
  projects.sort((a, b) => collator.compare(a.project.name, b.project.name))

  const projectIds = projects.map(p => p.project.id)

  // A star counts only where the caller is a real member: an admin's synthetic
  // 'admin' role is not membership, and a removed member's row is left behind
  // on purpose (see `projectStars` in the schema).
  const starredIds = new Set(db.select({ projectId: schema.projectStars.projectId })
    .from(schema.projectStars)
    .where(eq(schema.projectStars.userId, userId))
    .all()
    .map(s => s.projectId))

  // Batch: boards per project
  const allBoards = db.select().from(schema.boards)
    .where(inArray(schema.boards.projectId, projectIds))
    .all()

  // Batch: lists per project
  const allLists = db.select().from(schema.lists)
    .where(inArray(schema.lists.projectId, projectIds))
    .all()

  // Batch: cards per project, with the status category for progress.
  // Archived cards count nowhere.
  const allCards = db.select({
    projectId: schema.cards.projectId,
    statusId: schema.cards.statusId,
    milestoneId: schema.cards.milestoneId,
    createdAt: schema.cards.createdAt,
    updatedAt: schema.cards.updatedAt,
    category: schema.statuses.category
  })
    .from(schema.cards)
    .innerJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(and(inArray(schema.cards.projectId, projectIds), isNull(schema.cards.archivedAt)))
    .all()
  // Build doneStatusId lookup per project
  const doneStatusByProject = new Map<string, string | null>()
  for (const { project } of projects) {
    doneStatusByProject.set(project.id, project.doneStatusId)
  }

  const cardCountByProject = new Map<string, number>()
  const openCardCountByProject = new Map<string, number>()
  const lastActivityByProject = new Map<string, string>()
  const categoriesByProject = new Map<string, StatusCategory[]>()
  const milestonesWithOpenCards = new Set<string>()
  for (const card of allCards) {
    cardCountByProject.set(card.projectId, (cardCountByProject.get(card.projectId) || 0) + 1)
    // Progress counts by category (`progressOf`); `openCards` below keeps its
    // own meaning, everything but the done status.
    const categories = categoriesByProject.get(card.projectId)
    if (categories) categories.push(card.category)
    else categoriesByProject.set(card.projectId, [card.category])
    if (!CLOSED_CATEGORIES.includes(card.category) && card.milestoneId) {
      milestonesWithOpenCards.add(card.milestoneId)
    }
    if (card.statusId !== doneStatusByProject.get(card.projectId)) {
      openCardCountByProject.set(card.projectId, (openCardCountByProject.get(card.projectId) || 0) + 1)
    }
    const ts = card.updatedAt?.toISOString() || card.createdAt?.toISOString()
    if (ts) {
      const current = lastActivityByProject.get(card.projectId)
      if (!current || ts > current) lastActivityByProject.set(card.projectId, ts)
    }
  }

  // The current milestone is the first, by position, that still has open work.
  const progressByProject = new Map([...categoriesByProject].map(([id, categories]) => [id, progressOf(categories)]))
  const currentMilestoneByProject = new Map<string, { id: string, name: string }>()
  const allMilestones = db.select({ id: schema.milestones.id, name: schema.milestones.name, projectId: schema.milestones.projectId })
    .from(schema.milestones)
    .where(inArray(schema.milestones.projectId, projectIds))
    .orderBy(asc(schema.milestones.position), asc(schema.milestones.createdAt))
    .all()
  for (const m of allMilestones) {
    if (!currentMilestoneByProject.has(m.projectId) && milestonesWithOpenCards.has(m.id)) {
      currentMilestoneByProject.set(m.projectId, { id: m.id, name: m.name })
    }
  }

  // Batch: project leads
  const leadIds = [...new Set(projects.map(p => p.project.leadId).filter((id): id is string => !!id))]
  const leadRows = leadIds.length
    ? db.select(userRefColumns()).from(schema.users).where(inArray(schema.users.id, leadIds)).all()
    : []
  const { ref: leadRef } = createUserRefs(leadRows)
  const leads = new Map(leadRows.map(u => [u.id, leadRef(u)]))

  // Batch: members per project (count + first 3 avatars)
  const allMembers = db.select({
    projectId: schema.projectMembers.projectId,
    userId: schema.projectMembers.userId,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl,
    kind: schema.users.kind,
    color: schema.users.color
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(inArray(schema.projectMembers.projectId, projectIds))
    .all()

  const memberCountByProject = new Map<string, number>()
  const memberAvatarsByProject = new Map<string, Array<{ name: string, avatarUrl: string | null, kind: 'human' | 'agent', color: string | null }>>()
  for (const m of allMembers) {
    memberCountByProject.set(m.projectId, (memberCountByProject.get(m.projectId) || 0) + 1)
    const avatars = memberAvatarsByProject.get(m.projectId) || []
    if (avatars.length < 3) avatars.push({ name: m.name, avatarUrl: m.avatarUrl, kind: m.kind, color: m.color })
    memberAvatarsByProject.set(m.projectId, avatars)
  }

  return projects.map(({ project, role }) => ({
    ...project,
    role,
    starred: role !== 'admin' && starredIds.has(project.id),
    boardCount: allBoards.filter(b => b.projectId === project.id).length,
    listCount: allLists.filter(l => l.projectId === project.id).length,
    totalCards: cardCountByProject.get(project.id) || 0,
    openCards: openCardCountByProject.get(project.id) || 0,
    scopeCards: progressByProject.get(project.id)?.scope ?? 0,
    completedCards: progressByProject.get(project.id)?.completed ?? 0,
    lead: (project.leadId && leads.get(project.leadId)) || null,
    currentMilestone: currentMilestoneByProject.get(project.id) || null,
    memberCount: memberCountByProject.get(project.id) || 0,
    memberAvatars: memberAvatarsByProject.get(project.id) || [],
    lastActivity: lastActivityByProject.get(project.id) || null
  }))
})
