import { eq, and } from 'drizzle-orm'
import { columnReorderSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { columns: columnOrder } = await readBodyAs(event, columnReorderSchema)

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

  emitViewChange(board.projectId)

  return { ok: true }
})
