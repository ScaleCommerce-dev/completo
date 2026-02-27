import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const body = await readBody<{ name: string, slug?: string, columns?: string[], tagFilters?: string[] }>(event)

  if (!body.name) {
    throw createError({ statusCode: 400, message: 'Board name is required' })
  }

  // Generate or validate slug
  let slug = body.slug || generateSlug(body.name)

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw createError({ statusCode: 400, message: 'Invalid slug format' })
  }

  // Ensure slug is unique within the project
  const existing = db.select({ id: schema.boards.id })
    .from(schema.boards)
    .where(and(eq(schema.boards.projectId, project.id), eq(schema.boards.slug, slug)))
    .get()

  if (existing) {
    // Append short ID suffix for uniqueness
    const suffix = crypto.randomUUID().slice(0, 4)
    slug = `${slug}-${suffix}`
  }

  const existingBoards = db.select().from(schema.boards)
    .where(eq(schema.boards.projectId, project.id))
    .all()

  const boardId = crypto.randomUUID()
  db.insert(schema.boards).values({
    id: boardId,
    projectId: project.id,
    name: body.name,
    slug,
    position: existingBoards.length,
    tagFilters: body.tagFilters?.length ? JSON.stringify(body.tagFilters) : null,
    createdById: user.id
  }).run()

  // Check if project has any statuses yet
  let projectStatuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, project.id))
    .all()

  if (projectStatuses.length === 0) {
    // Create default statuses at project level
    const defaultStatuses = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']
    const defaultColors = ['#a1a1aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981']

    for (let i = 0; i < defaultStatuses.length; i++) {
      const colId = crypto.randomUUID()
      db.insert(schema.statuses).values({
        id: colId,
        projectId: project.id,
        name: defaultStatuses[i]!,
        color: defaultColors[i]!
      }).run()
    }

    projectStatuses = db.select().from(schema.statuses)
      .where(eq(schema.statuses.projectId, project.id))
      .all()
  }

  // Determine which statuses to link
  const selectedStatusIds = body.columns?.length
    ? new Set(body.columns)
    : null

  // Link statuses to the new board
  let linkPosition = 0
  for (let i = 0; i < projectStatuses.length; i++) {
    // If columns were specified, only link selected ones
    if (selectedStatusIds && !selectedStatusIds.has(projectStatuses[i]!.id)) continue

    // Try to get position from an existing board's board_columns
    let position = linkPosition
    if (existingBoards.length > 0) {
      const existingBc = db.select().from(schema.boardColumns)
        .where(eq(schema.boardColumns.boardId, existingBoards[0]!.id))
        .all()
        .find(bc => bc.statusId === projectStatuses[i]!.id)
      if (existingBc) {
        position = existingBc.position
      }
    }

    db.insert(schema.boardColumns).values({
      boardId,
      statusId: projectStatuses[i]!.id,
      position
    }).run()
    linkPosition++
  }

  setResponseStatus(event, 201)
  return db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get()
})
