/**
 * Walking a board's cards from the card panel.
 *
 * The panel makes the board inert, so while it is open the arrow keys have
 * nothing else to do — and the board is a grid, so mapping them to it is the
 * obvious thing. ↑/↓ walk the column you are in; ←/→ cross to the next column.
 * Linear's peek does the vertical half of this, and the same "arrow through a
 * list with the preview open" pattern is in Gmail, Finder and Quick Look.
 *
 * Two rules that are decisions rather than details:
 *
 *  - **No wrapping.** ↓ on the last card does nothing. A dead end is how you
 *    learn you are at the end; wrapping silently teleports you to the top and
 *    the next ↓ looks like the list re-ordered itself.
 *  - **Crossing lands on the top card**, which is what makes ←/→ *not*
 *    reversible: → then ← returns you to the top of where you started, not to
 *    the card you left. The alternatives are worse — preserving the index runs
 *    into columns of different lengths, and remembering a position per column
 *    means → sometimes lands mid-column for reasons the user cannot see.
 *
 * Empty columns are skipped rather than landed on: there would be no card to
 * show, so stopping there would read as the key having failed.
 */
export type NavDirection = 'up' | 'down' | 'left' | 'right'

export interface NavTarget {
  cardId: number
  columnId: string
}

export function nextCard(opts: {
  /** Board columns, in display order. */
  columns: ReadonlyArray<{ id: string }>
  /** Visible cards per column, in display order — filtered exactly as rendered. */
  cardsByColumn: Readonly<Record<string, ReadonlyArray<{ id: number }>>>
  currentColumnId: string
  currentCardId: number
  direction: NavDirection
}): NavTarget | null {
  const { columns, cardsByColumn, currentColumnId, currentCardId, direction } = opts

  if (direction === 'up' || direction === 'down') {
    const cards = cardsByColumn[currentColumnId] ?? []
    const at = cards.findIndex(c => c.id === currentCardId)
    if (at === -1) return null
    const target = cards[at + (direction === 'down' ? 1 : -1)]
    return target ? { cardId: target.id, columnId: currentColumnId } : null
  }

  const at = columns.findIndex(c => c.id === currentColumnId)
  if (at === -1) return null
  const step = direction === 'right' ? 1 : -1

  for (let i = at + step; i >= 0 && i < columns.length; i += step) {
    const column = columns[i]!
    const first = (cardsByColumn[column.id] ?? [])[0]
    if (first) return { cardId: first.id, columnId: column.id }
  }
  return null
}

/**
 * Whether the arrow keys belong to something else on screen.
 *
 * They almost always do: a caret in the title, description or comment box moves
 * by character, an open status/priority/assignee/tag menu moves by item, and the
 * due-date calendar moves by day. Every one of those is a more specific claim on
 * the key than "show me another card", so navigation only runs when none of them
 * is true.
 *
 * Checked by role and focus rather than by listener order, the same way
 * Cmd+Enter is routed — so neither side depends on which component mounted.
 */
export function arrowKeysAreClaimed(doc: Document): boolean {
  const el = doc.activeElement as HTMLElement | null
  if (el?.isContentEditable) return true
  if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true

  // A menu, a select list, or the date picker's calendar grid.
  if (doc.querySelector('[role="menu"],[role="listbox"],[role="grid"]')) return true

  // A confirmation stacked on top of the panel — the panel itself is one dialog,
  // so a second means something is asking a question that owns the keyboard.
  return doc.querySelectorAll('[role="dialog"],[role="alertdialog"]').length > 1
}
