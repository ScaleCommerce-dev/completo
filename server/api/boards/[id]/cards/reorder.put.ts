import { eq, and, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, board } = await resolveBoard(event, { columnAccess: false })
  const { moves } = await readBody<{ moves: { cardId: number, statusId: string, position: number }[] }>(event)

  if (!moves?.length) {
    throw createError({ statusCode: 400, message: 'Moves array is required' })
  }

  // Validate all statusIds belong to this project. Every status of the project,
  // not only the targets: a recorded move names the status it left as well.
  const statusNames = new Map(db.select({ id: schema.statuses.id, name: schema.statuses.name }).from(schema.statuses)
    .where(eq(schema.statuses.projectId, board.projectId))
    .all()
    .map(s => [s.id, s.name]))
  for (const move of moves) {
    if (!statusNames.has(move.statusId)) {
      throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
    }
  }

  // Validate all cardIds belong to this project
  const cardIds = moves.map(m => m.cardId)
  const validCards = db.select({ id: schema.cards.id, statusId: schema.cards.statusId }).from(schema.cards)
    .where(and(
      inArray(schema.cards.id, cardIds),
      eq(schema.cards.projectId, board.projectId)
    ))
    .all()
  if (validCards.length !== new Set(cardIds).size) {
    throw createError({ statusCode: 400, message: 'Card does not belong to this project' })
  }

  db.transaction(() => {
    // A move that keeps its status is a reorder, which is not history.
    const statusOf = new Map(validCards.map(c => [c.id, c.statusId]))
    for (const move of moves) {
      db.update(schema.cards)
        .set({ statusId: move.statusId, position: move.position, updatedAt: new Date() })
        .where(eq(schema.cards.id, move.cardId))
        .run()
      const from = statusOf.get(move.cardId)
      if (from !== move.statusId) {
        recordCardEvents(user, [{
          cardId: move.cardId,
          field: 'status',
          from: from ? { id: from, value: statusNames.get(from) ?? '' } : null,
          to: { id: move.statusId, value: statusNames.get(move.statusId)! }
        }])
        statusOf.set(move.cardId, move.statusId)
      }
    }
  })

  // A bulk reorder renumbers many cards at once; one invalidate settles every
  // observer's ordering rather than a burst of per-card upserts.
  emitViewChange(board.projectId)

  return { ok: true }
})
