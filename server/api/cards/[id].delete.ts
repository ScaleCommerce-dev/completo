import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)

  // Collect storage keys before cascade delete removes attachment rows
  const attachmentKeys = db.select({ storageKey: schema.attachments.storageKey })
    .from(schema.attachments)
    .where(eq(schema.attachments.cardId, card.id))
    .all()
    .map(a => a.storageKey)

  db.delete(schema.cards).where(eq(schema.cards.id, card.id)).run()

  // Clean up files on disk (best effort)
  if (attachmentKeys.length > 0) {
    storage.deleteMany(attachmentKeys).catch((err) => {
      console.error('Failed to clean up attachment files:', err)
    })
  }

  return { ok: true }
})
