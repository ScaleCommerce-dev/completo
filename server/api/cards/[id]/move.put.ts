import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)
  const { statusId, position } = await readBody<{ statusId: string, position: number }>(event)

  if (!statusId || position === undefined) {
    throw createError({ statusCode: 400, message: 'statusId and position are required' })
  }

  if (typeof position !== 'number' || position < 0 || !Number.isInteger(position) || position > 10000) {
    throw createError({ statusCode: 400, message: 'Position must be a non-negative integer (max 10000)' })
  }

  // Validate statusId belongs to the card's project
  const status = db.select().from(schema.statuses)
    .where(and(eq(schema.statuses.id, statusId), eq(schema.statuses.projectId, card.projectId)))
    .get()
  if (!status) {
    throw createError({ statusCode: 400, message: 'Status does not belong to this project' })
  }

  db.transaction(() => {
    // Get all cards in the target status (excluding the moving card)
    const targetCards = db.select().from(schema.cards)
      .where(and(
        eq(schema.cards.statusId, statusId),
        eq(schema.cards.projectId, card.projectId)
      ))
      .all()
      .filter(c => c.id !== card.id)
      .sort((a, b) => a.position - b.position)

    // Insert at position
    targetCards.splice(position, 0, { ...card, statusId, position })

    // Update positions in target status — only bump updatedAt on the moved card
    for (let i = 0; i < targetCards.length; i++) {
      const isMovedCard = targetCards[i]!.id === card.id
      db.update(schema.cards)
        .set(isMovedCard
          ? { position: i, statusId, updatedAt: new Date() }
          : { position: i })
        .where(eq(schema.cards.id, targetCards[i]!.id))
        .run()
    }

    // If moved to a different status, also renumber the source status
    if (card.statusId !== statusId) {
      const sourceCards = db.select().from(schema.cards)
        .where(eq(schema.cards.statusId, card.statusId))
        .all()
        .filter(c => c.id !== card.id)
        .sort((a, b) => a.position - b.position)

      for (let i = 0; i < sourceCards.length; i++) {
        db.update(schema.cards)
          .set({ position: i })
          .where(eq(schema.cards.id, sourceCards[i]!.id))
          .run()
      }
    }
  })

  return { ok: true }
})
