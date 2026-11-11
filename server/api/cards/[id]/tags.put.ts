import { eq, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)
  const { tagIds } = await readBody<{ tagIds: string[] }>(event)

  if (!Array.isArray(tagIds)) {
    throw createError({ statusCode: 400, message: 'tagIds must be an array' })
  }

  // Validate all tagIds belong to the card's project
  const projectTags = tagIds.length > 0
    ? db.select().from(schema.tags)
        .where(eq(schema.tags.projectId, card.projectId))
        .all()
    : []
  if (tagIds.length > 0) {
    const validIds = new Set(projectTags.map(t => t.id))
    for (const tagId of tagIds) {
      if (!validIds.has(tagId)) {
        throw createError({ statusCode: 400, message: 'Tag does not belong to this project' })
      }
    }
  }

  db.transaction(() => {
    // One event per tag that actually came or went: the request replaces the
    // whole set, but re-sending a tag the card already carries changes nothing.
    const had = db.select({ id: schema.tags.id, name: schema.tags.name }).from(schema.cardTags)
      .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
      .where(eq(schema.cardTags.cardId, card.id))
      .all()
    const wanted = [...new Set(tagIds)]
    const added = wanted.filter(id => !had.some(t => t.id === id))
    const addedNames = new Map(projectTags.map(t => [t.id, t.name]))
    recordCardEvents(user, [
      ...had.filter(t => !wanted.includes(t.id))
        .map(t => ({ cardId: card.id, field: 'tag' as const, from: { id: t.id, value: t.name } })),
      ...added.map(id => ({ cardId: card.id, field: 'tag' as const, to: { id, value: addedNames.get(id) ?? '' } }))
    ])

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

  emitCardChange(card.id, card.projectId)

  return { tags }
})
