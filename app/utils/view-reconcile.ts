/**
 * Applying a live SSE event to a view's card array.
 *
 * Pure and mutating-in-place, the same shape the optimistic card patches in
 * `useViewData` already use: the array is the reactive `data.value.cards`, and
 * push / splice / Object.assign are what Vue is watching. Kept out of the
 * composable so the membership and insert/update/remove decisions can be tested
 * against a plain array without a Nuxt runtime — see `view-reconcile.test.ts`.
 *
 * The one rule that is not obvious: a `card.upsert` is not always an insert or an
 * update. A card whose status moved off this board must be *removed* from a board
 * that still holds its row, because the board only shows cards in its own columns.
 * Deciding that needs the incoming card and the board's column set together, which
 * is why `belongs` is computed by the caller and passed in rather than re-derived
 * per branch here.
 */

interface ReconcileCard {
  id: number
  statusId: string
}

export type UpsertAction = 'inserted' | 'updated' | 'removed' | 'ignored'

/**
 * Does a card belong on this view?
 *
 * A list shows every card in the project, so membership is unconditional — the
 * SSE stream is already scoped to the project. A board shows only cards whose
 * status is one of its columns, so a card belongs iff its `statusId` is linked.
 */
export function cardBelongsToView(
  viewType: 'boards' | 'lists',
  boardStatusIds: string[],
  card: ReconcileCard
): boolean {
  if (viewType === 'lists') return true
  return boardStatusIds.includes(card.statusId)
}

/**
 * Merge an upserted card into `cards`, or insert it, or evict it — see the header.
 * `Object.assign` over the existing row rather than replacing it keeps object
 * identity stable, so Vue patches the existing card component instead of tearing
 * it down and replaying its entrance animation.
 */
export function applyCardUpsert<T extends ReconcileCard>(
  cards: T[],
  incoming: T,
  belongs: boolean
): UpsertAction {
  const index = cards.findIndex(c => c.id === incoming.id)

  if (index >= 0) {
    if (belongs) {
      Object.assign(cards[index] as object, incoming)
      return 'updated'
    }
    cards.splice(index, 1)
    return 'removed'
  }

  if (belongs) {
    cards.push(incoming)
    return 'inserted'
  }
  return 'ignored'
}

/** Remove a card by id. Returns whether a row was actually present. */
export function applyCardDelete(cards: ReconcileCard[], id: number): boolean {
  const index = cards.findIndex(c => c.id === id)
  if (index < 0) return false
  cards.splice(index, 1)
  return true
}
