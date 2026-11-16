import { eq } from 'drizzle-orm'

// Test-only: backdate a card's `updatedAt`, which is what done retention measures.
// Every write path stamps it with the current time, so this is the only way a test
// can produce a done card that has sat past the project's retention window.
export default defineEventHandler(async (event) => {
  requireTestEndpoints()
  const { cardId, daysAgo } = await readBody<{ cardId: number, daysAgo: number }>(event)
  if (!Number.isInteger(cardId) || typeof daysAgo !== 'number') {
    throw createError({ statusCode: 400, message: 'cardId and daysAgo are required' })
  }
  db.update(schema.cards)
    .set({ updatedAt: new Date(Date.now() - daysAgo * 86400000) })
    .where(eq(schema.cards.id, cardId))
    .run()
  return { ok: true }
})
