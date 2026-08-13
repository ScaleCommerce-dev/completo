import { eq, inArray, sql } from 'drizzle-orm'

interface CardTag { id: string, name: string, color: string }

interface CardUser { id: string, name: string, avatarUrl: string | null }

interface CardMetadataMaps {
  tagsByCard: Map<number, CardTag[]>
  attachCountByCard: Map<number, number>
  commentCountByCard: Map<number, number>
}

/**
 * Bulk-fetch tags, attachment counts and comment counts for a set of card IDs.
 * Returns Maps keyed by cardId — useful when you need to apply metadata
 * across multiple groups (e.g. my-tasks).
 */
export function fetchCardMetadata(cardIds: number[]): CardMetadataMaps {
  if (!cardIds.length) {
    return { tagsByCard: new Map(), attachCountByCard: new Map(), commentCountByCard: new Map() }
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

  // Bulk-fetch comment counts. Same shape as the attachments query rather than a
  // join: two grouped counts in one statement would need a subquery per side.
  const commentCounts = db.select({
    cardId: schema.comments.cardId,
    count: sql<number>`count(*)`
  })
    .from(schema.comments)
    .where(inArray(schema.comments.cardId, cardIds))
    .groupBy(schema.comments.cardId)
    .all()

  const commentCountByCard = new Map(commentCounts.map(r => [r.cardId, r.count]))

  return { tagsByCard, attachCountByCard, commentCountByCard }
}

/**
 * Bulk-fetch the users who created a set of cards, keyed by user ID.
 *
 * A second `leftJoin` on `users` is not an option here: every card query already
 * joins it for the assignee, so resolving the creator in the same statement would
 * need a drizzle `alias()`. Batch-fetching the distinct creator IDs instead matches
 * how board and list creators are resolved in `projects/[id].get.ts`.
 */
export function fetchCardCreators(cards: Array<{ createdById: string | null }>): Map<string, CardUser> {
  const creatorIds = [...new Set(cards.map(c => c.createdById).filter(Boolean))] as string[]
  if (!creatorIds.length) return new Map()

  const creators = db.select({
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.users)
    .where(inArray(schema.users.id, creatorIds))
    .all()

  return new Map(creators.map(c => [c.id, c]))
}

/**
 * Enrich an array of cards with tags, attachment and comment counts, and
 * creator info. Convenience wrapper around fetchCardMetadata + fetchCardCreators.
 */
export function enrichCardsWithMetadata<T extends { id: number, createdById: string | null }>(cards: T[]) {
  const { tagsByCard, attachCountByCard, commentCountByCard } = fetchCardMetadata(cards.map(c => c.id))
  const creatorsById = fetchCardCreators(cards)
  return cards.map(card => ({
    ...card,
    tags: tagsByCard.get(card.id) || [],
    attachmentCount: attachCountByCard.get(card.id) || 0,
    commentCount: commentCountByCard.get(card.id) || 0,
    creator: card.createdById ? creatorsById.get(card.createdById) || null : null
  }))
}
