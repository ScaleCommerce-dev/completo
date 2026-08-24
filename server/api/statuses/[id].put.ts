import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { status } = await resolveStatus(event)
  const { name, color } = await readBody<{ name?: string, color?: string }>(event)

  if (color !== undefined && color !== null && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  db.update(schema.statuses).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color })
  }).where(eq(schema.statuses.id, status.id)).run()

  // A renamed or recoloured status repaints every column and pill that shows it.
  emitViewChange(status.projectId)

  return db.select().from(schema.statuses).where(eq(schema.statuses.id, status.id)).get()
})
