import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tag } = await resolveTag(event)
  const { name, color } = await readBody<{ name?: string, color?: string }>(event)

  if (color !== undefined && color !== null && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  db.update(schema.tags).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color })
  }).where(eq(schema.tags.id, tag.id)).run()

  // A renamed or recoloured tag repaints every pill that carries it.
  emitViewChange(tag.projectId)

  return db.select().from(schema.tags).where(eq(schema.tags.id, tag.id)).get()
})
