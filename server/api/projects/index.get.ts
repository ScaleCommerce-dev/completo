import { eq, inArray } from 'drizzle-orm'

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

  const projectIds = projects.map(p => p.project.id)

  // Batch: boards per project
  const allBoards = db.select().from(schema.boards)
    .where(inArray(schema.boards.projectId, projectIds))
    .all()

  // Batch: lists per project
  const allLists = db.select().from(schema.lists)
    .where(inArray(schema.lists.projectId, projectIds))
    .all()

  // Batch: cards per project
  const allCards = db.select().from(schema.cards)
    .where(inArray(schema.cards.projectId, projectIds))
    .all()
  // Build doneStatusId lookup per project
  const doneStatusByProject = new Map<string, string | null>()
  for (const { project } of projects) {
    doneStatusByProject.set(project.id, project.doneStatusId)
  }

  const cardCountByProject = new Map<string, number>()
  const openCardCountByProject = new Map<string, number>()
  const lastActivityByProject = new Map<string, string>()
  for (const card of allCards) {
    cardCountByProject.set(card.projectId, (cardCountByProject.get(card.projectId) || 0) + 1)
    if (card.statusId !== doneStatusByProject.get(card.projectId)) {
      openCardCountByProject.set(card.projectId, (openCardCountByProject.get(card.projectId) || 0) + 1)
    }
    const ts = card.updatedAt?.toISOString() || card.createdAt?.toISOString()
    if (ts) {
      const current = lastActivityByProject.get(card.projectId)
      if (!current || ts > current) lastActivityByProject.set(card.projectId, ts)
    }
  }

  // Batch: members per project (count + first 3 avatars)
  const allMembers = db.select({
    projectId: schema.projectMembers.projectId,
    userId: schema.projectMembers.userId,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(inArray(schema.projectMembers.projectId, projectIds))
    .all()

  const memberCountByProject = new Map<string, number>()
  const memberAvatarsByProject = new Map<string, Array<{ name: string, avatarUrl: string | null }>>()
  for (const m of allMembers) {
    memberCountByProject.set(m.projectId, (memberCountByProject.get(m.projectId) || 0) + 1)
    const avatars = memberAvatarsByProject.get(m.projectId) || []
    if (avatars.length < 3) avatars.push({ name: m.name, avatarUrl: m.avatarUrl })
    memberAvatarsByProject.set(m.projectId, avatars)
  }

  return projects.map(({ project, role }) => ({
    ...project,
    role,
    boardCount: allBoards.filter(b => b.projectId === project.id).length,
    listCount: allLists.filter(l => l.projectId === project.id).length,
    totalCards: cardCountByProject.get(project.id) || 0,
    openCards: openCardCountByProject.get(project.id) || 0,
    memberCount: memberCountByProject.get(project.id) || 0,
    memberAvatars: memberAvatarsByProject.get(project.id) || [],
    lastActivity: lastActivityByProject.get(project.id) || null
  }))
})
