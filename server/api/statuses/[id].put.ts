import { eq } from 'drizzle-orm'
import { nameColorUpdateSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const { status } = await resolveStatus(event)
  const { name, color } = await readBodyAs(event, nameColorUpdateSchema)

  db.update(schema.statuses).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color })
  }).where(eq(schema.statuses.id, status.id)).run()

  // A renamed or recoloured status repaints every column and pill that shows it.
  emitViewChange(status.projectId)

  return db.select().from(schema.statuses).where(eq(schema.statuses.id, status.id)).get()
})
