import { eq, and, or, ne, isNull, inArray, sql } from 'drizzle-orm'

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
 * Which of these cards have comment activity `userId` has not read: a comment
 * newer than their read-state that they did not write. A card with no read-state
 * row counts every foreign comment as unread (baseline 0).
 *
 * Both timestamps are read raw (`sql<number>`) rather than through drizzle's
 * `timestamp` mapping so the comparison is integer-to-integer in the same stored
 * unit — mixing a raw `max(created_at)` with a mapped `Date.getTime()` would
 * compare seconds against milliseconds and silently mislabel everything.
 *
 * A NULL author (a comment whose author was deleted) counts as foreign: it is not
 * the current user, so it is unread until seen.
 */
export function fetchUnreadCardIds(cardIds: number[], userId: string): Set<number> {
  if (!cardIds.length) return new Set()

  const latestForeign = db.select({
    cardId: schema.comments.cardId,
    at: sql<number>`max(${schema.comments.createdAt})`
  })
    .from(schema.comments)
    .where(and(
      inArray(schema.comments.cardId, cardIds),
      or(isNull(schema.comments.authorId), ne(schema.comments.authorId, userId))
    ))
    .groupBy(schema.comments.cardId)
    .all()

  if (!latestForeign.length) return new Set()

  const reads = db.select({
    cardId: schema.cardReads.cardId,
    at: sql<number>`${schema.cardReads.lastReadAt}`
  })
    .from(schema.cardReads)
    .where(and(inArray(schema.cardReads.cardId, cardIds), eq(schema.cardReads.userId, userId)))
    .all()
  const readAt = new Map(reads.map(r => [r.cardId, r.at ?? 0]))

  const unread = new Set<number>()
  for (const row of latestForeign) {
    if (row.at != null && row.at > (readAt.get(row.cardId) ?? 0)) unread.add(row.cardId)
  }
  return unread
}

/**
 * Stamp `userId` as having read `cardId`'s comments now. Upserts on the
 * (user, card) unique index, so it is safe to call on every comment-list fetch.
 */
export function markCardRead(userId: string, cardId: number) {
  db.insert(schema.cardReads)
    .values({ userId, cardId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.cardReads.userId, schema.cardReads.cardId],
      set: { lastReadAt: new Date() }
    })
    .run()
}

/**
 * Enrich an array of cards with tags, attachment and comment counts, and
 * creator info. Convenience wrapper around fetchCardMetadata + fetchCardCreators.
 *
 * Pass `userId` to also compute per-user `hasUnread`. It is added *only* when a
 * user is given: the live-broadcast path (`emitCardChange`) enriches with no user
 * and must not carry a `hasUnread` key, or applying that event on a client would
 * clobber the recipient's own unread state with someone else's (always false).
 */
export function enrichCardsWithMetadata<T extends { id: number, createdById: string | null }>(
  cards: T[],
  opts?: { userId?: string }
) {
  const { tagsByCard, attachCountByCard, commentCountByCard } = fetchCardMetadata(cards.map(c => c.id))
  const creatorsById = fetchCardCreators(cards)
  const unread = opts?.userId ? fetchUnreadCardIds(cards.map(c => c.id), opts.userId) : null
  return cards.map(card => ({
    ...card,
    tags: tagsByCard.get(card.id) || [],
    attachmentCount: attachCountByCard.get(card.id) || 0,
    commentCount: commentCountByCard.get(card.id) || 0,
    creator: card.createdById ? creatorsById.get(card.createdById) || null : null,
    ...(unread ? { hasUnread: unread.has(card.id) } : {})
  }))
}
