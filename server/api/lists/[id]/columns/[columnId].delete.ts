import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, list } = await resolveList(event)
  const columnId = getRouterParam(event, 'columnId')

  const column = db.select().from(schema.listColumns)
    .where(and(
      eq(schema.listColumns.listId, list.id),
      eq(schema.listColumns.id, columnId!)
    ))
    .get()

  if (!column) {
    throw createError({ statusCode: 404, message: 'Column not found in this list' })
  }

  db.delete(schema.listColumns)
    .where(eq(schema.listColumns.id, columnId!))
    .run()

  return { ok: true }
})
