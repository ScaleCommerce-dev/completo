import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, description, briefing, key, slug, icon, doneStatusId, doneRetentionDays } = await readBody<{ name?: string, description?: string, briefing?: string | null, key?: string, slug?: string, icon?: string, doneStatusId?: string | null, doneRetentionDays?: number | null }>(event)

  if (key !== undefined) {
    if (!/^[A-Z]{2,5}$/.test(key)) {
      throw createError({ statusCode: 400, message: 'Project key must be 2-5 uppercase letters' })
    }
    const existing = db.select().from(schema.projects)
      .where(and(eq(schema.projects.key, key), ne(schema.projects.id, project.id)))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: `Project key "${key}" is already in use` })
    }
  }

  if (slug !== undefined) {
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw createError({ statusCode: 400, message: 'Slug must be lowercase alphanumeric with hyphens' })
    }
    const existing = db.select().from(schema.projects)
      .where(and(eq(schema.projects.slug, slug), ne(schema.projects.id, project.id)))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: `Slug "${slug}" is already in use` })
    }
  }

  if (doneStatusId !== undefined && doneStatusId !== null) {
    const col = db.select().from(schema.statuses)
      .where(and(eq(schema.statuses.id, doneStatusId), eq(schema.statuses.projectId, project.id)))
      .get()
    if (!col) {
      throw createError({ statusCode: 400, message: 'Done status must belong to this project' })
    }
  }

  if (doneRetentionDays !== undefined && doneRetentionDays !== null) {
    if (typeof doneRetentionDays !== 'number' || !Number.isInteger(doneRetentionDays) || doneRetentionDays < 1) {
      throw createError({ statusCode: 400, message: 'doneRetentionDays must be a positive integer or null' })
    }
  }

  db.update(schema.projects).set({
    ...(name !== undefined && { name }),
    ...(slug !== undefined && { slug }),
    ...(description !== undefined && { description }),
    ...(briefing !== undefined && { briefing: briefing || null }),
    ...(key !== undefined && { key }),
    ...(icon !== undefined && { icon: icon || null }),
    ...(doneStatusId !== undefined && { doneStatusId }),
    ...(doneRetentionDays !== undefined && { doneRetentionDays })
  }).where(eq(schema.projects.id, project.id)).run()

  return db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get()
})
