import { eq } from 'drizzle-orm'

/**
 * A card's change history: who changed what on it, and exactly when.
 *
 * Every path that changes a recorded field calls `recordCardEvents` in the same
 * transaction as the write, and `tests/unit/card-history-recording.test.ts`
 * derives those paths from the code, so a new one that forgets fails there.
 *
 * Each change is its own row, never merged with the one before, however fast
 * they come: an agent can make five in a second, and "what happened" means all
 * five, in order. Reordering cards within a status is not recorded, because one
 * drag renumbers a whole column and none of it changes what a card says.
 */

/** One side of a change: the row it names (status, person, tag, file) and its name now, or a plain value. */
export interface HistorySide {
  id?: string | null
  value: string
}

export interface CardChange {
  cardId: number
  field: CardHistoryField
  /** Null or absent means "none": unassigned, no due date, a tag the card did not carry. */
  from?: HistorySide | null
  to?: HistorySide | null
}

/** Whoever made the request: a person, or an agent through its token. */
export interface HistoryActor {
  id: string
  name: string
}

/** Write one event per change, in the order given. Call it inside the write's transaction. */
export function recordCardEvents(actor: HistoryActor, changes: CardChange[]): void {
  for (const change of changes) {
    db.insert(schema.cardEvents).values({
      cardId: change.cardId,
      actorId: actor.id,
      actorName: actor.name,
      field: change.field,
      fromId: change.from?.id ?? null,
      fromValue: change.from?.value ?? null,
      toId: change.to?.id ?? null,
      toValue: change.to?.value ?? null,
      createdAt: new Date()
    }).run()
  }
}

export function statusSide(id: string | null | undefined): HistorySide | null {
  if (!id) return null
  const row = db.select({ name: schema.statuses.name }).from(schema.statuses).where(eq(schema.statuses.id, id)).get()
  return { id, value: row?.name ?? '' }
}

export function userSide(id: string | null | undefined): HistorySide | null {
  if (!id) return null
  const row = db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, id)).get()
  return { id, value: row?.name ?? '' }
}

/**
 * A due date as the column holds it: whole seconds, so a value that differs only
 * below a second is the same date, and an unparseable one is no date.
 */
function dueSide(date: Date | null | undefined): HistorySide | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return { value: new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString() }
}

const valueSide = (value: string | null | undefined): HistorySide | null => (value == null ? null : { value })

type CardRow = typeof schema.cards.$inferSelect

/**
 * What a card update actually changes, field by field and in a fixed order. A
 * field sent with the value it already has is not a change, so a client that
 * saves the whole form records only what differs.
 */
export function cardFieldChanges(before: CardRow, after: {
  title?: string
  description?: string | null
  assigneeId?: string | null
  priority?: string | null
  statusId?: string
  dueDate?: Date | null
}): CardChange[] {
  const changes: CardChange[] = []
  const cardId = before.id

  if (after.title !== undefined && after.title !== before.title) {
    changes.push({ cardId, field: 'title', from: valueSide(before.title), to: valueSide(after.title) })
  }
  if (after.statusId !== undefined && after.statusId !== before.statusId) {
    changes.push({ cardId, field: 'status', from: statusSide(before.statusId), to: statusSide(after.statusId) })
  }
  if (after.assigneeId !== undefined && (after.assigneeId ?? null) !== before.assigneeId) {
    changes.push({ cardId, field: 'assignee', from: userSide(before.assigneeId), to: userSide(after.assigneeId) })
  }
  if (after.priority !== undefined && (after.priority ?? null) !== before.priority) {
    changes.push({ cardId, field: 'priority', from: valueSide(before.priority), to: valueSide(after.priority) })
  }
  if (after.dueDate !== undefined) {
    const from = dueSide(before.dueDate)
    const to = dueSide(after.dueDate)
    if (from?.value !== to?.value) changes.push({ cardId, field: 'dueDate', from, to })
  }
  // That it changed, never what it says: the text is the card's to show, and
  // a history that copied it would keep a description someone deleted.
  if (after.description !== undefined && (after.description ?? '') !== (before.description ?? '')) {
    changes.push({ cardId, field: 'description' })
  }
  return changes
}

/**
 * Deleting an account unassigns its cards through the foreign key (`set null`),
 * which no handler writes and so nothing would record. Call it just before the
 * delete, in the same transaction, with whoever is deleting it.
 */
export function recordAccountRemoval(user: HistoryActor, actor: HistoryActor): void {
  const cards = db.select({ id: schema.cards.id }).from(schema.cards)
    .where(eq(schema.cards.assigneeId, user.id))
    .all()
  recordCardEvents(actor, cards.map(c => ({
    cardId: c.id,
    field: 'assignee' as const,
    from: { id: user.id, value: user.name },
    to: null
  })))
}
