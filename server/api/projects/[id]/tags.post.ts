import { eq } from 'drizzle-orm'
import { tagCreateSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const { user: _user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, color } = await readBodyAs(event, tagCreateSchema)

  const tagId = crypto.randomUUID()
  db.insert(schema.tags).values({
    id: tagId,
    projectId: project.id,
    name,
    color: color || DEFAULT_COLOR
  }).run()

  emitViewChange(project.id)

  setResponseStatus(event, 201)
  return db.select().from(schema.tags).where(eq(schema.tags.id, tagId)).get()
})
