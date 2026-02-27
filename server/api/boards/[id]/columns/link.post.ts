import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { statusId } = await readBody<{ statusId: string }>(event)

  if (!statusId) {
    throw createError({ statusCode: 400, message: 'statusId is required' })
  }

  const status = db.select().from(schema.statuses).where(eq(schema.statuses.id, statusId)).get()
  if (!status) {
    throw createError({ statusCode: 404, message: 'Status not found' })
  }

  if (status.projectId !== board.projectId) {
    throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
  }

  const existing = db.select().from(schema.boardColumns)
    .where(and(
      eq(schema.boardColumns.boardId, board.id),
      eq(schema.boardColumns.statusId, statusId)
    ))
    .get()

  if (existing) {
    throw createError({ statusCode: 409, message: 'Status already linked to this board' })
  }

  const maxPos = getMaxBoardColumnPosition(board.id)

  const newPosition = maxPos + 1

  db.insert(schema.boardColumns).values({
    boardId: board.id,
    statusId,
    position: newPosition
  }).run()

  return { ...status, position: newPosition }
})
