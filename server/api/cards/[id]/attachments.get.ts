import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)

  return db.select().from(schema.attachments)
    .where(eq(schema.attachments.cardId, card.id))
    .all()
})
