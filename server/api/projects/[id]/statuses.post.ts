import { eq } from 'drizzle-orm'
import { statusCreateSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const { user: _user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, color } = await readBodyAs(event, statusCreateSchema)

  const statusId = crypto.randomUUID()
  db.insert(schema.statuses).values({
    id: statusId,
    projectId: project.id,
    name,
    color: color || DEFAULT_COLOR
  }).run()

  emitViewChange(project.id)

  setResponseStatus(event, 201)
  return db.select().from(schema.statuses).where(eq(schema.statuses.id, statusId)).get()
})
