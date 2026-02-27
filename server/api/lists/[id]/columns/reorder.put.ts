import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, list } = await resolveList(event)
  const { columns: columnOrder } = await readBody<{ columns: { id: string, position: number }[] }>(event)

  if (!columnOrder?.length) {
    throw createError({ statusCode: 400, message: 'Columns array is required' })
  }

  db.transaction(() => {
    for (const col of columnOrder) {
      db.update(schema.listColumns)
        .set({ position: col.position })
        .where(and(
          eq(schema.listColumns.listId, list.id),
          eq(schema.listColumns.id, col.id)
        ))
        .run()
    }
  })

  return { ok: true }
})
