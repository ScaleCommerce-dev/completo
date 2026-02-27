import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)
  const { name, color } = await readBody<{ name: string, color?: string }>(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Status name is required' })
  }

  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  // Create status at project level
  const statusId = crypto.randomUUID()
  db.insert(schema.statuses).values({
    id: statusId,
    projectId: board.projectId,
    name,
    color: color || '#6366f1'
  }).run()

  // Link to the current board only
  const maxBcPos = getMaxBoardColumnPosition(board.id)

  db.insert(schema.boardColumns).values({
    boardId: board.id,
    statusId,
    position: maxBcPos + 1
  }).run()

  const col = db.select().from(schema.statuses).where(eq(schema.statuses.id, statusId)).get()

  // Return with position from the current board's board_columns
  const bc = db.select().from(schema.boardColumns)
    .where(eq(schema.boardColumns.statusId, statusId))
    .all()
    .find(r => r.boardId === board.id)

  return { ...col, position: bc?.position ?? 0 }
})
