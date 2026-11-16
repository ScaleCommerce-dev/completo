/**
 * What a board card can show, declared once.
 *
 * This is the board's answer to `list-fields.ts`: a list already lets you choose
 * which of a card's properties a row displays, and a board card is the same
 * question with a different layout. Boards could hide two things and lists
 * eleven, which was an inconsistency rather than a decision.
 *
 * **Hiding a field never hides its control.** The card's footer row always
 * exists, because the four editors — tags, priority, due date, assignee — live
 * there and appear on hover. A switch here decides whether the *value* is
 * painted at rest; a hidden field's slot behaves exactly as an empty one does,
 * and its tooltip still names the current value. So no setting on this list can
 * put a board in a state where something is uneditable, only in one where it is
 * quieter. That is what makes shipping all of them on by default free.
 *
 * **Stored as the fields that are *off*,** not the ones that are on. A board
 * that has never been touched holds `null`, and a field added to this list later
 * is absent from every board's hidden set — so it appears everywhere by default,
 * which is the behaviour we want. Storing the enabled set would silently hide
 * each new field from every board that predates it.
 */
export interface CardFieldDef {
  key: string
  label: string
}

/**
 * Order matters: the settings dialog fills a two-column grid row-major from this
 * list, so neighbours here are neighbours on screen.
 */
export const CARD_FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'tags', label: 'Tags' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'ticketId', label: 'Ticket ID' },
  { key: 'priority', label: 'Priority' },
  { key: 'commentCount', label: 'Comment count' },
  { key: 'attachmentCount', label: 'Attachment count' },
  // One switch for both ends of the relationship: they share one footer slot,
  // a parent's "2/5" and a sub-task's parent ticket, and a card is never both.
  { key: 'subtasks', label: 'Sub-tasks' }
] as const satisfies readonly CardFieldDef[]

export type CardField = typeof CARD_FIELDS[number]['key']

/**
 * What a new board hides. The attachment count, because it is the weaker of the
 * two content counts — usually one pasted screenshot, where three comments mean
 * the card is being argued about — and a footer carrying a parent, a date and an
 * assignee has no room for both. Written into the board when it is created
 * (both board inserts), not read as a fallback: a board stores the fields that
 * are *off*, so a board that predates this default keeps showing the count, as
 * its team set it up to.
 */
export const DEFAULT_HIDDEN_CARD_FIELDS: readonly CardField[] = ['attachmentCount']

const CARD_FIELD_KEYS = new Set<string>(CARD_FIELDS.map(f => f.key))

export function isCardField(key: unknown): key is CardField {
  return typeof key === 'string' && CARD_FIELD_KEYS.has(key)
}

/**
 * Whatever a client sent, reduced to keys this version knows about.
 *
 * Unknown keys are dropped rather than rejected: a board saved by a newer
 * release naming a field this one has never heard of should lose that one
 * setting, not fail to save. Sorted so the stored JSON is stable and a no-op
 * save doesn't look like a change.
 */
export function normalizeHiddenCardFields(input: unknown): CardField[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter(isCardField))].sort()
}

/** The card face reads this. `hidden` is whatever came back from the API. */
export function cardFieldVisible(hidden: readonly string[] | null | undefined, key: CardField): boolean {
  return !hidden?.includes(key)
}
