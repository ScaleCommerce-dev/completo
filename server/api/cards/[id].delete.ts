import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)

  // Collect storage keys before cascade delete removes attachment rows
  const attachmentKeys = db.select({ storageKey: schema.attachments.storageKey })
    .from(schema.attachments)
    .where(eq(schema.attachments.cardId, card.id))
    .all()
    .map(a => a.storageKey)

  // Its sub-tasks become ordinary cards through the foreign key (`set null`);
  // record that on them, and on its parent, in the same transaction.
  const children = subtasksOf(card.id)
  db.transaction(() => {
    recordCardRemoval(user, card)
    db.delete(schema.cards).where(eq(schema.cards.id, card.id)).run()
  })

  emitCardRemoved(card.id, card.projectId)
  for (const child of children) emitCardChange(child.id, card.projectId)
  if (card.parentId) emitCardChange(card.parentId, card.projectId)

  // Clean up files on disk (best effort)
  if (attachmentKeys.length > 0) {
    storage.deleteMany(attachmentKeys).catch((err) => {
      console.error('Failed to clean up attachment files:', err)
    })
  }

  return { ok: true }
})
