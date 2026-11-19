import { eq, inArray, sql } from 'drizzle-orm'

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

  // A star counts for every project listed here, because the list is exactly the
  // projects the caller can see (their memberships, or all of them for an admin).
  // A removed member's row is left behind on purpose (see `projectStars` in the
  // schema) and drops out with the project.
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

  // Per project: how many cards, how many are not done, and when one last
  // changed. Counted in SQL: this backs the sidebar, and it used to load every
  // column of every card in every visible project, descriptions included, to
  // produce these three numbers. `IS NOT` is SQLite's null-safe inequality, so a
  // project without a done status counts every card as open.
  const cardStats = db.select({
    projectId: schema.cards.projectId,
    total: sql<number>`count(*)`,
    open: sql<number>`sum(case when ${schema.cards.statusId} is not ${schema.projects.doneStatusId} then 1 else 0 end)`,
    lastActivity: sql<number | null>`max(coalesce(${schema.cards.updatedAt}, ${schema.cards.createdAt}))`
  })
    .from(schema.cards)
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .where(inArray(schema.cards.projectId, projectIds))
    .groupBy(schema.cards.projectId)
    .all()

  const cardCountByProject = new Map<string, number>()
  const openCardCountByProject = new Map<string, number>()
  const lastActivityByProject = new Map<string, string>()
  for (const row of cardStats) {
    cardCountByProject.set(row.projectId, row.total)
    openCardCountByProject.set(row.projectId, row.open)
    // Timestamps are stored in seconds (drizzle `mode: 'timestamp'`).
    if (row.lastActivity != null) lastActivityByProject.set(row.projectId, new Date(row.lastActivity * 1000).toISOString())
  }

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
    starred: starredIds.has(project.id),
    boardCount: allBoards.filter(b => b.projectId === project.id).length,
    listCount: allLists.filter(l => l.projectId === project.id).length,
    totalCards: cardCountByProject.get(project.id) || 0,
    openCards: openCardCountByProject.get(project.id) || 0,
    memberCount: memberCountByProject.get(project.id) || 0,
    memberAvatars: memberAvatarsByProject.get(project.id) || [],
    lastActivity: lastActivityByProject.get(project.id) || null
  }))
})
