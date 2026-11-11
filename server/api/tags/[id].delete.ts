import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, tag } = await resolveTag(event)

  db.transaction(() => {
    // The tag comes off every card that carried it, through the foreign key;
    // each of those cards' history says so.
    const cards = db.select({ cardId: schema.cardTags.cardId }).from(schema.cardTags)
      .where(eq(schema.cardTags.tagId, tag.id))
      .all()
    recordCardEvents(user, [...new Set(cards.map(c => c.cardId))].map(cardId => ({
      cardId,
      field: 'tag' as const,
      from: { id: tag.id, value: tag.name }
    })))
    db.delete(schema.tags).where(eq(schema.tags.id, tag.id)).run()
  })

  // The pill disappears from every card that carried it.
  emitViewChange(tag.projectId)

  return { ok: true }
})
