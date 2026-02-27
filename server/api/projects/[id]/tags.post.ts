import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, color } = await readBody<{ name: string, color?: string }>(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Tag name is required' })
  }

  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  const tagId = crypto.randomUUID()
  db.insert(schema.tags).values({
    id: tagId,
    projectId: project.id,
    name,
    color: color || '#6366f1'
  }).run()

  setResponseStatus(event, 201)
  return db.select().from(schema.tags).where(eq(schema.tags.id, tagId)).get()
})
