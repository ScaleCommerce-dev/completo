import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, board } = await resolveBoard(event)
  // This creates a *project* status, not just a column. Board column access lets any
  // member who created the board through, which let a member add statuses only an
  // owner may rename or delete; statuses.post.ts is owner-only for the same act.
  requireProjectOwner(board.projectId, user.id, { isAdmin: user.isAdmin })
  const { name, color } = await readBody<{ name: string, color?: string }>(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Status name is required' })
  }

  if (color && !isHexColor(color)) {
    throw createError({ statusCode: 400, message: 'Color must be a valid hex color (#RRGGBB)' })
  }

  // Create status at project level
  const statusId = crypto.randomUUID()
  db.insert(schema.statuses).values({
    id: statusId,
    projectId: board.projectId,
    name,
    color: color || DEFAULT_COLOR
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

  emitViewChange(board.projectId)

  return { ...col, position: bc?.position ?? 0 }
})
