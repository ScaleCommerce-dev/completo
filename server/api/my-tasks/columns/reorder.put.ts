import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { columns: columnOrder } = await readBody<{ columns: { id: string, position: number }[] }>(event)

  if (!columnOrder?.length) {
    throw createError({ statusCode: 400, message: 'Columns array is required' })
  }

  db.transaction(() => {
    for (const col of columnOrder) {
      db.update(schema.myTasksColumns)
        .set({ position: col.position })
        .where(and(
          eq(schema.myTasksColumns.userId, user.id),
          eq(schema.myTasksColumns.id, col.id)
        ))
        .run()
    }
  })

  return { ok: true }
})
