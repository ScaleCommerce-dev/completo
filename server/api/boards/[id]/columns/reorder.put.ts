import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, board } = await resolveBoard(event)
  const { columns: columnOrder } = await readBody<{ columns: { id: string, position: number }[] }>(event)

  if (!columnOrder?.length) {
    throw createError({ statusCode: 400, message: 'Columns array is required' })
  }

  db.transaction(() => {
    for (const col of columnOrder) {
      db.update(schema.boardColumns)
        .set({ position: col.position })
        .where(and(
          eq(schema.boardColumns.boardId, board.id),
          eq(schema.boardColumns.statusId, col.id)
        ))
        .run()
    }
  })

  return { ok: true }
})
