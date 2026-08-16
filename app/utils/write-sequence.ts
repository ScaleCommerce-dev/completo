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
