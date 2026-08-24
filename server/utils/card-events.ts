import { eq } from 'drizzle-orm'

/**
 * Emit a live `card.upsert` for one card, in the shape the board and list views
 * already render.
 *
 * The payload is a superset of both view responses: `{ ...card, assignee, status,
 * tags, attachmentCount, commentCount, creator }`. The board ignores the nested
 * `status` (it groups by `statusId` into its own columns) and the list uses it;
 * carrying both means one event feeds either view with no per-view branch here.
 *
 * Re-selecting the row rather than trusting the caller's copy keeps this correct
 * for every caller uniformly — a move renumbers positions, a tag write changes
 * `tags`, a comment changes `commentCount` — so the emit site is always a single
 * `emitCardChange(id, projectId)` after the write commits, never a hand-built
 * object that drifts from what the GET returns.
 */
export function emitCardChange(cardId: number, projectId: string): void {
  const row = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .leftJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(eq(schema.cards.id, cardId))
    .get()
  if (!row) return

  const [card] = enrichCardsWithMetadata([{
    ...row.cards,
    assignee: row.users ? { id: row.users.id, name: row.users.name, avatarUrl: row.users.avatarUrl } : null,
    status: row.statuses ? { id: row.statuses.id, name: row.statuses.name, color: row.statuses.color } : null
  }])

  emitProjectEvent({ type: 'card.upsert', projectId, payload: card })
}

/** Emit a live `card.delete`. The id is enough: the client just splices the row. */
export function emitCardRemoved(cardId: number, projectId: string): void {
  emitProjectEvent({ type: 'card.delete', projectId, payload: { id: cardId } })
}

/**
 * Emit `card.activity` when a comment lands, carrying the commenter's id. Every
 * board/list viewer of the project receives it and raises the card's unread dot
 * unless they wrote the comment themselves. This is the live counterpart to the
 * server-computed `hasUnread`, which only refreshes on a full fetch — the dot
 * has to appear the moment the comment does, not on the next reload.
 */
export function emitCardActivity(cardId: number, projectId: string, actorId: string): void {
  emitProjectEvent({ type: 'card.activity', projectId, payload: { id: cardId, actorId } })
}

/**
 * Emit a `view.invalidate` for structural changes a per-card patch cannot express
 * — a status added or renamed, a column linked or reordered, a tag's colour
 * changed, board settings saved. The client answers with a debounced refetch, so
 * bursts (a drag that renumbers every column) collapse into one GET.
 */
export function emitViewChange(projectId: string): void {
  emitProjectEvent({ type: 'view.invalidate', projectId })
}
