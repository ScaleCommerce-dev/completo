import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const columnId = getRouterParam(event, 'columnId')

  const column = db.select().from(schema.myTasksColumns)
    .where(and(
      eq(schema.myTasksColumns.userId, user.id),
      eq(schema.myTasksColumns.id, columnId!)
    ))
    .get()

  if (!column) {
    throw createError({ statusCode: 404, message: 'Column not found' })
  }

  db.delete(schema.myTasksColumns)
    .where(eq(schema.myTasksColumns.id, columnId!))
    .run()

  return { ok: true }
})
