import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, board } = await resolveBoard(event)
  const columnId = getRouterParam(event, 'columnId')

  const link = db.select().from(schema.boardColumns)
    .where(and(
      eq(schema.boardColumns.boardId, board.id),
      eq(schema.boardColumns.statusId, columnId!)
    ))
    .get()

  if (!link) {
    throw createError({ statusCode: 404, message: 'Column not linked to this board' })
  }

  db.delete(schema.boardColumns)
    .where(and(
      eq(schema.boardColumns.boardId, board.id),
      eq(schema.boardColumns.statusId, columnId!)
    ))
    .run()

  return { ok: true }
})
