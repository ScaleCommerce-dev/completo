import { eq, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)
  const { tagIds } = await readBody<{ tagIds: string[] }>(event)

  if (!Array.isArray(tagIds)) {
    throw createError({ statusCode: 400, message: 'tagIds must be an array' })
  }

  // Validate all tagIds belong to the card's project
  if (tagIds.length > 0) {
    const projectTags = db.select().from(schema.tags)
      .where(eq(schema.tags.projectId, card.projectId))
      .all()
    const validIds = new Set(projectTags.map(t => t.id))
    for (const tagId of tagIds) {
      if (!validIds.has(tagId)) {
        throw createError({ statusCode: 400, message: 'Tag does not belong to this project' })
      }
    }
  }

  db.transaction(() => {
    db.delete(schema.cardTags).where(eq(schema.cardTags.cardId, card.id)).run()
    for (const tagId of tagIds) {
      db.insert(schema.cardTags).values({
        id: crypto.randomUUID(),
        cardId: card.id,
        tagId
      }).run()
    }
  })

  const tags = tagIds.length > 0
    ? db.select().from(schema.tags).where(inArray(schema.tags.id, tagIds)).all()
    : []

  return { tags }
})
