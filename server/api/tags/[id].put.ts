import { eq } from 'drizzle-orm'
import { nameColorUpdateSchema } from '#shared/schemas/project'

export default defineEventHandler(async (event) => {
  const { tag } = await resolveTag(event)
  const { name, color } = await readBodyAs(event, nameColorUpdateSchema)

  db.update(schema.tags).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color })
  }).where(eq(schema.tags.id, tag.id)).run()

  // A renamed or recoloured tag repaints every pill that carries it.
  emitViewChange(tag.projectId)

  return db.select().from(schema.tags).where(eq(schema.tags.id, tag.id)).get()
})
