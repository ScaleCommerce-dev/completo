/**
 * How much of the viewport the card panel takes, so the board can get out of its
 * way.
 *
 * The panel is a right-hand slideover, which was chosen so that reading a card
 * and then moving it — the loop this app exists for — doesn't mean closing the
 * card to see the board. It only half delivered that: on a 1440px window the
 * panel's left edge lands at 820px, which is inside the *second* column, so the
 * columns you could still see were the ones on the left and the card you had
 * just clicked was usually not among them.
 *
 * The fix is to move the board, not the panel. Left-aligning the panel would
 * shove the whole board sideways on every open and would contradict the card
 * page, whose properties sit in a right-hand rail.
 *
 * `CARD_PANEL_WIDTH` cannot drive the panel's own class: Tailwind needs the
 * literal `sm:max-w-[620px]` at build time. `tests/unit/card-panel.test.ts`
 * asserts the two agree, which is the same trick `menu-placement` uses.
 */
export const CARD_PANEL_WIDTH = 620

/**
 * Below this the panel is full-width, so there is no board left to reveal and
 * scrolling it would be motion for its own sake. Tailwind's `sm`.
 */
export const CARD_PANEL_MIN_VIEWPORT = 640

/** Breathing room between the revealed column and the panel's edge. */
const GUTTER = 12

/**
 * How far to scroll a board so `column` clears the card panel. `0` when it
 * already does, or when the window is too narrow for the move to help.
 *
 * Returning a number rather than doing the scrolling keeps this testable without
 * a DOM: everything here is arithmetic on rectangles the caller measures.
 */
export function scrollToClearPanel(opts: {
  /** The column's viewport rect. */
  column: { left: number, right: number }
  /** The scroll container's viewport rect. */
  board: { left: number }
  viewportWidth: number
}): number {
  const { column, board, viewportWidth } = opts
  if (viewportWidth < CARD_PANEL_MIN_VIEWPORT) return 0

  const panelLeft = viewportWidth - CARD_PANEL_WIDTH
  const overflow = column.right - panelLeft
  if (overflow <= 0) return 0

  // Don't trade one hidden edge for another: if the strip left of the panel is
  // narrower than the column, scrolling would push its left edge out of view to
  // rescue its right. On a window that small the panel simply covers the board,
  // and shuffling it is not an improvement.
  const available = panelLeft - board.left
  if (available < column.right - column.left + GUTTER) return 0

  return overflow + GUTTER
}
