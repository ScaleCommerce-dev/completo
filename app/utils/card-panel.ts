/**
 * How the board gets out of the card panel's way.
 *
 * The panel is a right-hand slideover, chosen so that reading a card and then
 * moving it — the loop this app exists for — doesn't mean closing the card to see
 * the board. The first attempt at honouring that nudged the board just far enough
 * to clear the panel, which worked but landed every column somewhere different:
 * the scroll distance depended on where the card happened to be, so the board
 * shifted by an unpredictable amount on every open.
 *
 * Now the clicked column takes the position the *first* column occupies on a
 * freshly loaded board — same gutter, same x — and the panel takes everything to
 * its right. Two things follow from that:
 *
 *  - It is deterministic. The column you clicked is always in the same place, so
 *    there is nothing to re-find after the panel arrives.
 *  - The panel can be much wider, because it no longer has to leave room for
 *    columns nobody can reach. While it is open the board is `pointer-events:
 *    none` — Reka makes the rest of the page inert — so the columns behind it are
 *    context, not controls, and covering them costs nothing.
 *
 * Everything here is arithmetic on measurements the caller takes, so it is
 * testable without a DOM.
 */

/** Never narrower than the panel has always been. */
export const CARD_PANEL_MIN_WIDTH = 620

/**
 * And never wider than reading wants. Past this the panel is mostly slack: the
 * prose inside is capped at its own measure (see `ProseDescription`), so the
 * extra width would only stretch tables and code blocks that already fit.
 */
export const CARD_PANEL_MAX_WIDTH = 900

/** Between the revealed column and the panel's left edge. */
const GAP = 16

export interface BoardGeometry {
  viewportWidth: number
  /** The scroller's left edge — in practice, where the sidebar ends. */
  boardLeft: number
  /** Scroller origin to first column: the gutter a fresh board shows, preserved. */
  gutter: number
  columnWidth: number
}

/**
 * What the panel should take, or `null` when the window is too narrow for the
 * column-plus-panel layout to fit.
 *
 * `null` means "leave the board alone and use the default width" rather than
 * "squeeze": below roughly 1250px the panel would have to overlap the column it
 * had just revealed, which is worse than not revealing it.
 */
export function cardPanelWidth(g: BoardGeometry): number | null {
  const available = g.viewportWidth - (g.boardLeft + g.gutter + g.columnWidth + GAP)
  if (available < CARD_PANEL_MIN_WIDTH) return null
  return Math.min(available, CARD_PANEL_MAX_WIDTH)
}

/** Where the board must be scrolled for `columnOffset` to sit in the gutter. */
export function revealScrollLeft(columnOffset: number, gutter: number): number {
  return Math.max(0, columnOffset - gutter)
}

/**
 * Extra scroll room the board needs before that is even possible.
 *
 * A board can only scroll until its last column reaches the right edge, so the
 * columns nearest the end cannot reach the left gutter on their own — on the
 * demo board, `maxScrollLeft` is 769 while the last column needs 1264. Those are
 * exactly the columns the panel covers worst, so without this the promise breaks
 * where it matters most.
 *
 * The spacer is only ever as wide as the shortfall, which keeps it under the
 * panel and invisible. A spacer sized to the panel would show as blank board
 * beyond the last column on a wide window.
 */
export function revealSpacer(opts: {
  columnOffset: number
  gutter: number
  scrollWidth: number
  clientWidth: number
}): number {
  const target = revealScrollLeft(opts.columnOffset, opts.gutter)
  const reachable = opts.scrollWidth - opts.clientWidth
  return Math.max(0, target - reachable)
}
