import { eq, max } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, color, category } = await readBody<{ name: string, color?: string, category?: StatusCategory }>(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Status name is required' })
  }

  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  if (category !== undefined && !STATUS_CATEGORIES.includes(category)) {
    throw createError({ statusCode: 400, message: `category must be one of ${STATUS_CATEGORIES.join(', ')}` })
  }

  // A new status goes last in the project's order.
  const last = db.select({ p: max(schema.statuses.position) }).from(schema.statuses)
    .where(eq(schema.statuses.projectId, project.id)).get()

  const statusId = crypto.randomUUID()
  db.insert(schema.statuses).values({
    id: statusId,
    projectId: project.id,
    name,
    color: color || '#6366f1',
    // Without one, the category follows the name ("Canceled" is canceled work).
    category: category ?? categoryForStatusName(name),
    position: (last?.p ?? -1) + 1
  }).run()

  emitViewChange(project.id)

  setResponseStatus(event, 201)
  return db.select().from(schema.statuses).where(eq(schema.statuses.id, statusId)).get()
})
