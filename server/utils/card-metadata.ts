import { eq, inArray, sql } from 'drizzle-orm'

interface CardTag { id: string, name: string, color: string }

interface CardMetadataMaps {
  tagsByCard: Map<number, CardTag[]>
  attachCountByCard: Map<number, number>
}

/**
 * Bulk-fetch tags and attachment counts for a set of card IDs.
 * Returns Maps keyed by cardId — useful when you need to apply metadata
 * across multiple groups (e.g. my-tasks).
 */
export function fetchCardMetadata(cardIds: number[]): CardMetadataMaps {
  if (!cardIds.length) {
    return { tagsByCard: new Map(), attachCountByCard: new Map() }
  }

  // Bulk-fetch tags
  const allCardTags = db.select().from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .where(inArray(schema.cardTags.cardId, cardIds))
    .all()

  const tagsByCard = new Map<number, CardTag[]>()
  for (const row of allCardTags) {
    const cardId = row.card_tags.cardId
    if (!tagsByCard.has(cardId)) tagsByCard.set(cardId, [])
    tagsByCard.get(cardId)!.push({
      id: row.tags.id,
      name: row.tags.name,
      color: row.tags.color
    })
  }

  // Bulk-fetch attachment counts
  const attachmentCounts = db.select({
    cardId: schema.attachments.cardId,
    count: sql<number>`count(*)`
  })
    .from(schema.attachments)
    .where(inArray(schema.attachments.cardId, cardIds))
    .groupBy(schema.attachments.cardId)
    .all()

  const attachCountByCard = new Map(attachmentCounts.map(r => [r.cardId, r.count]))

  return { tagsByCard, attachCountByCard }
}

/**
 * Enrich an array of cards with tags and attachment counts.
 * Convenience wrapper around fetchCardMetadata.
 */
export function enrichCardsWithMetadata<T extends { id: number }>(cards: T[]) {
  const { tagsByCard, attachCountByCard } = fetchCardMetadata(cards.map(c => c.id))
  return cards.map(card => ({
    ...card,
    tags: tagsByCard.get(card.id) || [],
    attachmentCount: attachCountByCard.get(card.id) || 0
  }))
}
