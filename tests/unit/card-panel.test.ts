import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CARD_PANEL_WIDTH,
  CARD_PANEL_MIN_VIEWPORT,
  scrollToClearPanel
} from '../../app/utils/card-panel'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Numbers taken from the running app at 1440px: the sidebar ends at 245, the
 * board scroller starts there, columns are 304px wide with a 12px gap, and the
 * panel's left edge lands at 820 — inside the second column.
 */
const BOARD = { left: 245 }
const VIEWPORT = 1440
const COLUMN_W = 304

/** Column n's rect, laid out the way the board lays them out. */
function column(n: number, scrollLeft = 0) {
  const left = BOARD.left + 16 + n * (COLUMN_W + 12) - scrollLeft
  return { left, right: left + COLUMN_W }
}

describe('scrollToClearPanel', () => {
  it('leaves a column that is already clear alone', () => {
    // Backlog, at 261–565, is nowhere near the panel at 820.
    expect(scrollToClearPanel({ column: column(0), board: BOARD, viewportWidth: VIEWPORT })).toBe(0)
  })

  it('moves a column the panel would cover', () => {
    // "In Progress" sits at 893–1197, wholly behind the panel.
    const scroll = scrollToClearPanel({ column: column(2), board: BOARD, viewportWidth: VIEWPORT })

    expect(scroll).toBeGreaterThan(0)
    // Far enough that the column's right edge clears 820, with a gutter.
    expect(column(2).right - scroll).toBeLessThanOrEqual(VIEWPORT - CARD_PANEL_WIDTH)
  })

  it('moves a partly covered column exactly clear, and no further', () => {
    // Straddling the panel edge is the common case — the reason the loop this
    // panel exists for half worked.
    const straddling = { left: 700, right: 1004 }
    const scroll = scrollToClearPanel({ column: straddling, board: BOARD, viewportWidth: VIEWPORT })

    expect(straddling.right - scroll).toBe(VIEWPORT - CARD_PANEL_WIDTH - 12)
  })

  it('scrolls further for a column further right', () => {
    const near = scrollToClearPanel({ column: column(2), board: BOARD, viewportWidth: VIEWPORT })
    const far = scrollToClearPanel({ column: column(4), board: BOARD, viewportWidth: VIEWPORT })

    expect(far).toBeGreaterThan(near)
  })

  it('does nothing below the breakpoint where the panel is full-width', () => {
    // There is no board left to reveal, so moving it would be motion for its
    // own sake.
    const narrow = CARD_PANEL_MIN_VIEWPORT - 1
    expect(scrollToClearPanel({
      column: { left: 20, right: 324 },
      board: { left: 0 },
      viewportWidth: narrow
    })).toBe(0)
  })

  it('declines when the strip left of the panel is narrower than a column', () => {
    // Otherwise it trades a hidden right edge for a hidden left one. At 1024 the
    // panel starts at 404 and the board at 245, leaving 159px — half a column.
    expect(scrollToClearPanel({
      column: { left: 500, right: 804 },
      board: BOARD,
      viewportWidth: 1024
    })).toBe(0)
  })

  it('never returns a negative scroll', () => {
    // Scrolling backwards would drag a column the user had scrolled past back
    // into view, which is not what opening a card asked for.
    for (let n = 0; n < 8; n++) {
      expect(scrollToClearPanel({ column: column(n), board: BOARD, viewportWidth: VIEWPORT }))
        .toBeGreaterThanOrEqual(0)
    }
  })
})

/**
 * Tailwind needs the panel's width as a literal at build time, so the constant
 * cannot drive the class. Same trick as `menu-placement`: assert they agree,
 * rather than hoping.
 */
describe('the panel width the board reads is the width the panel has', () => {
  it('matches CardModal', () => {
    const modal = readFileSync(join(ROOT, 'app/components/CardModal.vue'), 'utf8')

    expect(modal).toContain(`sm:max-w-[${CARD_PANEL_WIDTH}px]`)
  })
})
