import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, color } = await readBody<{ name: string, color?: string }>(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Status name is required' })
  }

  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  const statusId = crypto.randomUUID()
  db.insert(schema.statuses).values({
    id: statusId,
    projectId: project.id,
    name,
    color: color || '#6366f1'
  }).run()

  setResponseStatus(event, 201)
  return db.select().from(schema.statuses).where(eq(schema.statuses.id, statusId)).get()
})
