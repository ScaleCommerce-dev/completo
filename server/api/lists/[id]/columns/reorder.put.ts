import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { columns: columnOrder } = await readBody<{ columns: { id: string, position: number }[] }>(event)

  if (!columnOrder?.length) {
    throw createError({ statusCode: 400, message: 'Columns array is required' })
  }

  for (const col of columnOrder) {
    if (typeof col.position !== 'number' || col.position < 0 || !Number.isInteger(col.position) || col.position > 10000) {
      throw createError({ statusCode: 400, message: 'Position must be a non-negative integer (max 10000)' })
    }
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
