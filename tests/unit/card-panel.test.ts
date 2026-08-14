import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CARD_PANEL_MIN_WIDTH,
  CARD_PANEL_MAX_WIDTH,
  cardPanelWidth,
  revealScrollLeft,
  revealSpacer
} from '../../app/utils/card-panel'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Measured off the running board at 1440px: the sidebar ends at 269, the
 * scroller's content starts 16px in, columns are 304px wide on a 12px gap. The
 * five columns therefore sit at these offsets from the scroller's content
 * origin, and the board can scroll 769px before its last column hits the right
 * edge.
 */
const BOARD = { boardLeft: 269, gutter: 16, columnWidth: 304 }
const COLUMN_AT = { backlog: 16, todo: 332, inProgress: 648, review: 964, done: 1280 }
const SCROLL = { scrollWidth: 1916, clientWidth: 1147 } // maxScrollLeft = 769

describe('cardPanelWidth', () => {
  it('takes everything the focused column does not need', () => {
    // 1440 − (269 sidebar + 16 gutter + 304 column + 16 gap)
    expect(cardPanelWidth({ ...BOARD, viewportWidth: 1440 })).toBe(835)
  })

  it('stops growing where reading stops benefiting', () => {
    // A 27" monitor would otherwise hand over a ~1300px panel holding a 576px
    // text column, which is slack rather than room.
    expect(cardPanelWidth({ ...BOARD, viewportWidth: 1920 })).toBe(CARD_PANEL_MAX_WIDTH)
  })

  it('declines when the panel would have to overlap the column it just revealed', () => {
    // Below roughly 1250px there is no room for both, and a panel sitting on top
    // of the column it went to the trouble of revealing is worse than no reveal.
    expect(cardPanelWidth({ ...BOARD, viewportWidth: 1152 })).toBeNull()
  })

  it('is never narrower than the panel has always been', () => {
    for (let w = 640; w <= 2560; w += 7) {
      const width = cardPanelWidth({ ...BOARD, viewportWidth: w })
      if (width !== null) expect(width).toBeGreaterThanOrEqual(CARD_PANEL_MIN_WIDTH)
    }
  })

  it('accepts the exact width where the layout starts fitting', () => {
    const exact = BOARD.boardLeft + BOARD.gutter + BOARD.columnWidth + 16 + CARD_PANEL_MIN_WIDTH

    expect(cardPanelWidth({ ...BOARD, viewportWidth: exact })).toBe(CARD_PANEL_MIN_WIDTH)
    expect(cardPanelWidth({ ...BOARD, viewportWidth: exact - 1 })).toBeNull()
  })
})

describe('revealScrollLeft', () => {
  it('leaves the first column where it already is', () => {
    expect(revealScrollLeft(COLUMN_AT.backlog, BOARD.gutter)).toBe(0)
  })

  it('puts any column in the gutter the first one occupies', () => {
    // The point of the whole exercise: the clicked column always lands at the
    // same x, so there is nothing to re-find once the panel arrives.
    for (const offset of Object.values(COLUMN_AT)) {
      const scrolled = offset - revealScrollLeft(offset, BOARD.gutter)
      expect(scrolled).toBe(BOARD.gutter)
    }
  })

  it('never scrolls backwards', () => {
    expect(revealScrollLeft(0, BOARD.gutter)).toBe(0)
  })
})

describe('revealSpacer', () => {
  it('adds nothing for a column the board can already reach', () => {
    for (const offset of [COLUMN_AT.backlog, COLUMN_AT.todo, COLUMN_AT.inProgress]) {
      expect(revealSpacer({ columnOffset: offset, gutter: BOARD.gutter, ...SCROLL })).toBe(0)
    }
  })

  it('adds exactly the shortfall for a column it cannot', () => {
    // Review needs scrollLeft 948; the board stops at 769. Without the 179px
    // this returns, it lands 179px short of the gutter — and the columns nearest
    // the end are precisely the ones the panel covers worst.
    expect(revealSpacer({ columnOffset: COLUMN_AT.review, gutter: BOARD.gutter, ...SCROLL })).toBe(179)
    expect(revealSpacer({ columnOffset: COLUMN_AT.done, gutter: BOARD.gutter, ...SCROLL })).toBe(495)
  })

  it('adds no more than the shortfall, so it stays hidden behind the panel', () => {
    // A spacer sized to the panel instead would show as blank board past the
    // last column on a wide window.
    const spacer = revealSpacer({ columnOffset: COLUMN_AT.done, gutter: BOARD.gutter, ...SCROLL })
    const reachableAfter = SCROLL.scrollWidth + spacer - SCROLL.clientWidth

    expect(reachableAfter).toBe(revealScrollLeft(COLUMN_AT.done, BOARD.gutter))
  })
})

/**
 * Tailwind needs the panel's width as a build-time literal, so the board hands
 * the computed value over as a custom property instead. The fallback in that
 * class is what every surface without a board falls back to, and it has to be
 * the same number this module calls the minimum.
 */
describe('the width the board publishes is the width the panel reads', () => {
  const modal = readFileSync(join(ROOT, 'app/components/CardModal.vue'), 'utf8')

  it('reads the custom property', () => {
    expect(modal).toContain('sm:max-w-[var(--card-panel-w,')
  })

  it('falls back to the minimum, for a list or My Tasks', () => {
    expect(modal).toContain(`sm:max-w-[var(--card-panel-w,${CARD_PANEL_MIN_WIDTH}px)]`)
  })
})

/**
 * The panel grew so content-heavy cards are easier to read, which only works if
 * the prose does *not* grow with it — at 835px a paragraph runs to 113
 * characters, and past roughly 75 the eye loses its place on the return sweep.
 */
describe('prose keeps its measure however wide the surface gets', () => {
  const prose = readFileSync(join(ROOT, 'app/components/ProseDescription.vue'), 'utf8')

  it('caps the text blocks', () => {
    expect(prose).toMatch(/max-width: var\(--prose-measure, 36rem\)/)
  })

  it('lets the things that have no measure use the full width', () => {
    expect(prose).toMatch(/> pre[\s\S]{0,120}max-width: none/)
  })

  it('caps at what the old fixed-width panel already gave', () => {
    // 36rem = 576px, against 572px of text in the 620px panel — so nothing
    // changes at the old width and the cap only stops the *extra* width
    // reaching the prose.
    expect(36 * 16).toBeGreaterThanOrEqual(572)
    expect(36 * 16).toBeLessThan(CARD_PANEL_MIN_WIDTH)
  })
})
