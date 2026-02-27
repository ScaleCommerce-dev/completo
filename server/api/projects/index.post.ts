import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { name, description, briefing, key: rawKey, slug: rawSlug, icon, doneStatusName, doneRetentionDays } = await readBody<{ name: string, description?: string, briefing?: string, key?: string, slug?: string, icon?: string, doneStatusName?: string, doneRetentionDays?: number | null }>(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Project name is required' })
  }

  const key = rawKey || generateKey(name)

  if (!/^[A-Z]{2,5}$/.test(key)) {
    throw createError({ statusCode: 400, message: 'Project key must be 2-5 uppercase letters' })
  }

  const existing = db.select().from(schema.projects).where(eq(schema.projects.key, key)).get()
  if (existing) {
    throw createError({ statusCode: 409, message: `Project key "${key}" is already in use` })
  }

  const projectId = crypto.randomUUID()
  const slug = rawSlug
    ? rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/(^-|-$)/g, '')
    : `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${projectId.slice(0, 8)}`

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug cannot be empty' })
  }

  const existingSlug = db.select().from(schema.projects).where(eq(schema.projects.slug, slug)).get()
  if (existingSlug) {
    throw createError({ statusCode: 409, message: `Slug "${slug}" is already in use` })
  }

  const project = db.transaction(() => {
    db.insert(schema.projects).values({
      id: projectId,
      name,
      slug,
      key,
      description: description || null,
      briefing: briefing || null,
      icon: icon || null
    }).run()

    db.insert(schema.projectMembers).values({
      projectId,
      userId: user.id,
      role: 'owner'
    }).run()

    // Create default statuses at project level
    const defaultStatuses = [
      { name: 'Backlog', color: '#a1a1aa' },
      { name: 'To Do', color: '#3b82f6' },
      { name: 'In Progress', color: '#f59e0b' },
      { name: 'Review', color: '#8b5cf6' },
      { name: 'Done', color: '#10b981' }
    ]

    const statusIds: string[] = []
    for (const col of defaultStatuses) {
      const colId = crypto.randomUUID()
      statusIds.push(colId)
      db.insert(schema.statuses).values({
        id: colId,
        projectId,
        name: col.name,
        color: col.color
      }).run()
    }

    // Set the done status for the project
    const doneStatusIndex = doneStatusName
      ? defaultStatuses.findIndex(c => c.name === doneStatusName)
      : 4
    db.update(schema.projects).set({
      doneStatusId: statusIds[doneStatusIndex >= 0 ? doneStatusIndex : 4],
      doneRetentionDays: doneRetentionDays !== undefined ? doneRetentionDays : 30
    }).where(eq(schema.projects.id, projectId)).run()

    // Create default tags
    const defaultTags = [
      { name: 'Bug', color: '#ef4444' },
      { name: 'Feature', color: '#3b82f6' },
      { name: 'Discuss', color: '#f59e0b' }
    ]
    for (const tag of defaultTags) {
      db.insert(schema.tags).values({
        projectId,
        name: tag.name,
        color: tag.color
      }).run()
    }

    // Create default board and link all statuses
    const boardId = crypto.randomUUID()
    db.insert(schema.boards).values({
      id: boardId,
      projectId,
      name: 'Overview',
      slug: 'overview',
      position: 0,
      createdById: user.id
    }).run()

    for (let i = 0; i < statusIds.length; i++) {
      db.insert(schema.boardColumns).values({
        boardId,
        statusId: statusIds[i]!,
        position: i
      }).run()
    }

    return db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
  })

  setResponseStatus(event, 201)
  return project
})
