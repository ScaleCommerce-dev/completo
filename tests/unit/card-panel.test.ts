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

const MODAL = readFileSync(join(ROOT, 'app/components/CardModal.vue'), 'utf8')
const PROSE = readFileSync(join(ROOT, 'app/components/ProseDescription.vue'), 'utf8')

const tokens = (classList: string) => classList.split(/\s+/).filter(Boolean)

/**
 * Every class list the panel declares: real `class` attributes, plus the strings
 * it hands `USlideover`'s `ui` slots, which are class lists that do not look like
 * one.
 */
const PANEL_CLASS_LISTS = [
  ...[...MODAL.matchAll(/class="([^"]*)"/g)].map(m => m[1]!),
  ...[...MODAL.matchAll(/^\s*(?:content|header|body|footer): [`'](.*)$/gm)].map(m => m[1]!)
]

/**
 * The panel's inset above `sm`, in Tailwind steps and in px — read off the class
 * the header actually carries rather than restated here. It matches the 40px the
 * board keeps between the sidebar and its first column, so the panel is inset by
 * the same gap that separates the two surfaces either side of it.
 */
const PANEL_INSET_STEP = Number(MODAL.match(/header: '[^']*\bsm:px-(\d+)\b/)?.[1])
const PANEL_INSET = PANEL_INSET_STEP * 4

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
  it('reads the custom property', () => {
    expect(MODAL).toContain('sm:max-w-[var(--card-panel-w,')
  })

  it('falls back to the minimum, for a list or My Tasks', () => {
    expect(MODAL).toContain(`sm:max-w-[var(--card-panel-w,${CARD_PANEL_MIN_WIDTH}px)]`)
  })
})

/**
 * Text has a ceiling, set for screen reading rather than for print.
 *
 * Measured on the neighbours rather than assumed: GitHub caps an issue body at
 * 878px / 14px — 125 characters — unchanged between 1440 and 1920, and a README
 * at 838px / 16px, 106 characters. Linear's docs run 84. The 45–75 rule this was
 * first built on is Bringhurst describing a single-column serif page in print,
 * and the screen studies disagree with it.
 */
describe('prose has a screen-reading ceiling', () => {
  /** The cap itself, so nothing below has to restate it. */
  const MEASURE_REM = Number(PROSE.match(/max-width: var\(--prose-measure, ([\d.]+)rem\)/)?.[1])

  it('caps the text blocks', () => {
    expect(MEASURE_REM).toBeGreaterThan(0)
  })

  it('lets the things that have no measure use the full width', () => {
    expect(PROSE).toMatch(/> pre[\s\S]{0,120}max-width: none/)
  })

  it('is inset by the same gap the board keeps beside it', () => {
    // Not the 24px it inherited when the panel was a fixed 620 and never grew
    // with it. Mobile keeps 16 — at 390 the panel is the screen.
    //
    // Stated as one value shared by every region rather than as the header's whole
    // class string plus a blocklist: the version this replaces pinned
    // `header: 'block sm:px-10'` exactly, so adding a utility to the header broke
    // it, and forbade two dead values (`sm:px-6`, `sm:mx-6`) while passing on
    // `sm:px-8`.
    const insets = PANEL_CLASS_LISTS.flatMap(list => tokens(list).filter(t => /^sm:[pm]x-\d+$/.test(t)))

    expect(PANEL_INSET_STEP).toBeGreaterThan(0)
    // More than one region carries it — the header and the body's own sections —
    // and every one of them carries the same step.
    expect(insets.length).toBeGreaterThan(1)
    expect(new Set(insets.map(t => t.replace(/^sm:[pm]x-/, '')))).toEqual(new Set([String(PANEL_INSET_STEP)]))
    // And 16 below `sm`, on the section that holds the card's own body.
    expect(PANEL_CLASS_LISTS.some(list => tokens(list).includes('px-4') && tokens(list).includes(`sm:px-${PANEL_INSET_STEP}`))).toBe(true)
  })

  it('never binds inside the card panel, at any width the panel takes', () => {
    // The cap exists for the card *page*, whose main column runs past 1100px and
    // would otherwise reach ~150 characters; inside the panel prose fills the width
    // at every width the panel can take. Both sides come from source — the cap out
    // of the stylesheet, the inset off the header — where this used to write the
    // same 52rem twice, the second time as `52 * 16`, so neither copy could notice
    // the CSS moving.
    const widestPanelText = CARD_PANEL_MAX_WIDTH - 2 * PANEL_INSET

    // 16px to the rem, at the root size the app never changes.
    expect(MEASURE_REM * 16).toBeGreaterThanOrEqual(widestPanelText)
  })
})
