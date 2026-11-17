/**
 * "Is this still the newest write for this record?"
 *
 * Every card surface saves properties the moment they change and merges the PUT
 * response back over the local row, because the response carries fields the
 * caller does not have — `updatedAt`, a resolved assignee. That merge is correct
 * for one request and wrong for two: the app does not serialise them, so two
 * quick edits to the same card race, and `fetch` gives no ordering guarantee.
 * When the *earlier* response lands last it overwrites the newer value with a
 * stale one, and on the detail page `syncProperties()` then pulls the control
 * back to match — the priority you just set visibly reverts, and the database
 * disagrees with the screen until something refetches.
 *
 * It is rare enough to look like a glitch and reproducible enough to matter:
 * two clicks inside one round trip is ordinary use on a slow connection.
 *
 * Sequence numbers rather than aborting the older request: the older write must
 * still *happen*, since it may be editing a different field. Only its response
 * is uninteresting once a newer one has been issued.
 *
 * Rollback is guarded by the same token. A failed save must not restore its
 * snapshot over a newer edit that has already repainted.
 */
export function createWriteSequence<K = number>() {
  const latest = new Map<K, number>()

  /**
   * Call as a write is issued. The returned predicate reports whether this write
   * is still the most recent one for that key — check it after every `await`,
   * before touching local state.
   */
  return function beginWrite(key: K): () => boolean {
    const seq = (latest.get(key) ?? 0) + 1
    latest.set(key, seq)

    return () => latest.get(key) === seq
  }
}

/**
 * Save card fields the way every card view does: paint the row first, then PUT,
 * then take the server's row, or put the old one back and say so. One copy for
 * the project views and My Tasks, which each had this line for line.
 *
 * `row` is the card as the view holds it, or null when it is not on screen;
 * `resolve` repaints the nested objects (status, assignee) from the new ids;
 * `isLatest` is from `createWriteSequence`, so an older write settling after a
 * newer one changes nothing. The response has no `tags` or `attachmentCount`, so
 * assigning it over the row leaves those intact. Rethrows, so the card panel can
 * tell a failed save from a good one and keep the user's text.
 */
export async function putCardFields(opts: {
  cardId: number
  row: Record<string, unknown> | null
  updates: Record<string, unknown>
  resolve?: () => void
  isLatest: () => boolean
  onError: (e: unknown) => void
}): Promise<Record<string, unknown>> {
  const { cardId, row, updates, isLatest } = opts
  const snapshot = row ? { ...row } : null
  if (row) {
    Object.assign(row, updates)
    opts.resolve?.()
  }
  try {
    const card = await $fetch<Record<string, unknown>>(`/api/cards/${cardId}`, { method: 'PUT', body: updates })
    if (row && card && isLatest()) Object.assign(row, card)
    return card
  } catch (e) {
    if (row && snapshot && isLatest()) Object.assign(row, snapshot)
    opts.onError(e)
    throw e
  }
}
