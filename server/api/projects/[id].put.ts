import { eq, and, ne } from 'drizzle-orm'
import { projectUpdateSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const { user: _user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, description, briefing, key, slug, icon, doneStatusId, doneRetentionDays } = await readBodyAs(event, projectUpdateSchema)

  if (key !== undefined) {
    const existing = db.select().from(schema.projects)
      .where(and(eq(schema.projects.key, key), ne(schema.projects.id, project.id)))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: `Project key "${key}" is already in use` })
    }
  }

  if (slug !== undefined) {
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
