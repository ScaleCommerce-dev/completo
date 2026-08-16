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
 * Where the open card sits in its column — the "2/7" on the panel's walker.
 *
 * Counted over the same filtered ordering the chevrons walk, so the readout
 * agrees with what stepping actually does. Null when the card isn't in the
 * visible set — a filter can hide the open card — which hides the readout
 * rather than naming a position in a list the user can't see.
 */
export function columnPosition(
  cardsByColumn: Readonly<Record<string, ReadonlyArray<{ id: number }>>>,
  columnId: string,
  cardId: number
): { index: number, count: number } | null {
  const cards = cardsByColumn[columnId] ?? []
  const at = cards.findIndex(c => c.id === cardId)
  return at === -1 ? null : { index: at + 1, count: cards.length }
}

/**
 * Translate a drop index in the *visible* column into a position in the real one.
 *
 * vuedraggable reports `newIndex` against the list it was given, and the board
 * gives it the filtered cards. Both the optimistic renumber and
 * `cards/[id]/move.put.ts` then splice that number into the *unfiltered* column,
 * so any card the view is hiding makes the two disagree and the card lands in
 * the wrong slot.
 *
 * "Hidden" is not only the filter bar. A board GET drops done cards past their
 * retention window, so a project with `doneRetentionDays` set has a Done column
 * whose visible list is shorter than the stored one with no filter active at
 * all — the case nobody would think to test.
 *
 * The fix is to stop treating the index as a number and treat it as a
 * *neighbour*: whatever the user dropped the card after is what it must end up
 * after. Anchoring on the card above is what preserves the gesture; falling back
 * to the card below covers a drop at the very top, and an empty visible column
 * appends, which is the only answer that cannot reorder something unseen.
 *
 * Positions are expressed the way both consumers already read them: an index
 * into the target column *excluding* the moved card, which is what the server
 * builds before splicing.
 */
export function dropPosition(opts: {
  /** The target column as the user sees it, before the drop is applied. */
  visible: ReadonlyArray<{ id: number }>
  /** The target column as it is stored, before the drop is applied. */
  all: ReadonlyArray<{ id: number }>
  cardId: number
  /** vuedraggable's `newIndex`, indexing the visible list after the drop. */
  visibleIndex: number
}): number {
  const { cardId, visibleIndex } = opts
  // Both lists minus the card in flight: a same-column move reports an index
  // that already assumes the card has been lifted out.
  const visible = opts.visible.filter(c => c.id !== cardId)
  const all = opts.all.filter(c => c.id !== cardId)

  const positionOf = (id: number) => all.findIndex(c => c.id === id)

  const above = visibleIndex > 0 ? visible[visibleIndex - 1] : undefined
  if (above) {
    const at = positionOf(above.id)
    if (at !== -1) return at + 1
  }

  const below = visible[visibleIndex]
  if (below) {
    const at = positionOf(below.id)
    if (at !== -1) return at
  }

  // Dropped into a column with nothing visible to anchor to. Appending leaves
  // every hidden card where it was; inserting at 0 would silently push them down.
  return all.length
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
