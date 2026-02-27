import { eq, and, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, board } = await resolveBoard(event, { columnAccess: false })
  const { moves } = await readBody<{ moves: { cardId: number, statusId: string, position: number }[] }>(event)

  if (!moves?.length) {
    throw createError({ statusCode: 400, message: 'Moves array is required' })
  }

  // Validate all statusIds belong to this project
  const statusIds = [...new Set(moves.map(m => m.statusId))]
  const validStatuses = db.select({ id: schema.statuses.id }).from(schema.statuses)
    .where(and(
      inArray(schema.statuses.id, statusIds),
      eq(schema.statuses.projectId, board.projectId)
    ))
    .all()
  const validStatusIds = new Set(validStatuses.map(c => c.id))
  for (const move of moves) {
    if (!validStatusIds.has(move.statusId)) {
      throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
    }
  }

  // Validate all cardIds belong to this project
  const cardIds = moves.map(m => m.cardId)
  const validCards = db.select({ id: schema.cards.id }).from(schema.cards)
    .where(and(
      inArray(schema.cards.id, cardIds),
      eq(schema.cards.projectId, board.projectId)
    ))
    .all()
  if (validCards.length !== new Set(cardIds).size) {
    throw createError({ statusCode: 400, message: 'Card does not belong to this project' })
  }

  db.transaction(() => {
    for (const move of moves) {
      db.update(schema.cards)
        .set({ statusId: move.statusId, position: move.position, updatedAt: new Date() })
        .where(eq(schema.cards.id, move.cardId))
        .run()
    }
  })

  return { ok: true }
})
