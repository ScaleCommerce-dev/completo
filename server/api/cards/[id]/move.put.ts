import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)
  // `afterId` is the alternative to `position` for lists that do not show every
  // card of a status (archived cards keep positions a list never shows, so it
  // cannot know an index): the card goes right after that card of the target
  // status, or first when it is null.
  const { statusId, position, afterId } = await readBody<{ statusId: string, position?: number, afterId?: number | null }>(event)

  if (!statusId || (position === undefined && afterId === undefined)) {
    throw createError({ statusCode: 400, message: 'statusId and position are required' })
  }

  if (afterId === undefined && (typeof position !== 'number' || position < 0 || !Number.isInteger(position) || position > 10000)) {
    throw createError({ statusCode: 400, message: 'Position must be a non-negative integer (max 10000)' })
  }
  if (afterId !== undefined && afterId !== null && (!Number.isInteger(afterId) || afterId === card.id)) {
    throw createError({ statusCode: 400, message: 'afterId must be another card of the target status' })
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

    let index = position ?? 0
    if (afterId) {
      index = targetCards.findIndex(c => c.id === afterId) + 1
      if (!index) throw createError({ statusCode: 400, message: 'afterId must be another card of the target status' })
    }
    targetCards.splice(index, 0, { ...card, statusId, position: index })

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
      // Only the column change is history; the renumbering on either side is not.
      recordCardEvents(user, [{ cardId: card.id, field: 'status', from: statusSide(card.statusId), to: { id: status.id, value: status.name } }])

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

  // A move renumbers siblings in both columns, but the card that changed columns
  // is the only one an observer needs pushed: its new statusId regroups it and
  // its new position sorts it. The sibling renumbering is cosmetic drift that the
  // next event or refetch settles, so one upsert beats an invalidate storm.
  emitCardChange(card.id, card.projectId)

  return { ok: true }
})
