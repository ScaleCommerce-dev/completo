import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)

  // Collect storage keys before cascade delete removes attachment rows
  const attachmentKeys = db.select({ storageKey: schema.attachments.storageKey })
    .from(schema.attachments)
    .where(eq(schema.attachments.cardId, card.id))
    .all()
    .map(a => a.storageKey)

  // Its sub-issues and related cards lose it through foreign keys; record that on them.
  const touched = [
    ...db.select({ id: schema.cards.id, projectId: schema.cards.projectId }).from(schema.cards).where(eq(schema.cards.parentId, card.id)).all(),
    ...relationRows(card.id).map(r => r.fromCardId === card.id ? r.toCardId : r.fromCardId)
      .map(id => db.select({ id: schema.cards.id, projectId: schema.cards.projectId }).from(schema.cards).where(eq(schema.cards.id, id)).get()!)
  ]
  db.transaction(() => {
    recordCardRemoval(user, card.id)
    db.delete(schema.cards).where(eq(schema.cards.id, card.id)).run()
  })

  emitCardRemoved(card.id, card.projectId)
  for (const c of touched) emitCardChange(c.id, c.projectId)

  // Clean up files on disk (best effort)
  if (attachmentKeys.length > 0) {
    storage.deleteMany(attachmentKeys).catch((err) => {
      console.error('Failed to clean up attachment files:', err)
    })
  }

  return { ok: true }
})
