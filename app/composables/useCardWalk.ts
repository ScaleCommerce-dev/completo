import { nextInSequence, sequencePosition, arrowKeysAreClaimed, type SequenceDirection } from '~/utils/board-nav'

/**
 * Walking a flat set of cards from the card panel — a list view, My Tasks.
 *
 * ↑/↓ only, and that is the whole point of it being separate from the board's
 * walk: there is no second axis here, so the panel is handed no column flags and
 * hides its horizontal pair rather than showing two chevrons that can never do
 * anything (see `CardModal`'s `nav`).
 *
 * The board keeps its own wiring. It needs four directions, and crossing a column
 * has to scroll the board to reveal the one it lands in — neither has an analogue
 * here, and folding both into one composable meant a direction map, a reveal hook
 * and a grid flag threaded through for one caller each. What the two *do* share is
 * the part where being wrong is invisible: `nextInSequence` and
 * `sequencePosition` decide where the ends are and how a position is counted, for
 * both shapes.
 *
 * `sequence` is the ordering the host **rendered**, not one recomputed here. On a
 * list that is `ListView`'s `@order`, because its sort state has a local override
 * the page never sees when the viewer cannot persist a sort — so a page-side sort
 * would agree with the rows right up until someone clicked a column header.
 */
export function useCardWalk(opts: {
  /** Whether the panel is open. The arrow keys are only ours while it is. */
  open: () => boolean
  /** Every card the host is showing, in rendered order. */
  sequence: () => number[]
  currentId: () => number | null
  select: (cardId: number) => void
}) {
  /**
   * Takes the panel's whole `navigate` vocabulary, not just the vertical pair.
   * `CardModal` declares all four directions on the emit whichever chevrons it
   * actually drew, so a sequence host has to be handed the union and drop the two
   * it never rendered — narrowing here rather than at both call sites, which is
   * where the guard would eventually be forgotten in one of them.
   */
  function step(direction: SequenceDirection | 'prevColumn' | 'nextColumn') {
    if (direction !== 'prev' && direction !== 'next') return

    const current = opts.currentId()
    if (current === null) return

    const target = nextInSequence(opts.sequence(), current, direction)
    if (target !== null) opts.select(target)
  }

  /**
   * Undefined when nothing is open, which is what hides the walker entirely —
   * and undefined `hasPrevColumn`/`hasNextColumn` by omission, which is what
   * hides its horizontal half on this shape.
   */
  const nav = computed(() => {
    const current = opts.currentId()
    if (current === null) return undefined
    const sequence = opts.sequence()

    return {
      hasPrev: nextInSequence(sequence, current, 'prev') !== null,
      hasNext: nextInSequence(sequence, current, 'next') !== null,
      position: sequencePosition(sequence, current)
    }
  })

  const ARROWS: Record<string, SequenceDirection> = {
    ArrowUp: 'prev',
    ArrowDown: 'next'
  }

  /**
   * Capture phase and a role check rather than listener order, matching the board
   * and Cmd+Enter: a caret in the title or a comment box, an open picker, and the
   * due-date calendar all have a stronger claim on an arrow key than "show me
   * another card". ←/→ are deliberately not bound — on this shape they would mean
   * nothing, and swallowing them would break caret movement nothing else claims.
   */
  function onArrowKey(e: KeyboardEvent) {
    if (!opts.open() || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    const direction = ARROWS[e.key]
    if (!direction || arrowKeysAreClaimed(document)) return
    e.preventDefault()
    step(direction)
  }

  onMounted(() => document.addEventListener('keydown', onArrowKey, true))
  onUnmounted(() => document.removeEventListener('keydown', onArrowKey, true))

  return { nav, step }
}
