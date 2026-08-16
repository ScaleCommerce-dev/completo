import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')
const MAIN_CSS = join(ROOT, 'app/assets/css/main.css')
const LAYOUT = join(ROOT, 'app/layouts/default.vue')

/**
 * The command palette has to paint above every other surface, and nothing in
 * Nuxt UI arranges that: no dialog theme declares a z-index, so dialogs stack by
 * their order in `<body>` — which is the order their portals *mounted*, not the
 * order they opened. The palette lives in the layout, so it mounts first and
 * loses to every page-level dialog. Opening a card panel and hitting ⌘K put the
 * palette underneath it. `main.css` fixes that with one rule.
 *
 * Two things can quietly undo it, and both are what this file checks:
 *
 * - the marker class drifting out of the layout, or out of the rule, leaving a
 *   selector that matches nothing and a dialog with no z-index;
 * - a later change declaring a *higher* z-index somewhere that competes.
 *
 * The second is the reason the exemption list exists rather than a ban: a large
 * z-index inside `#__nuxt` is fine, because `#__nuxt` is `isolate` and its whole
 * subtree is one stacking level in `<body>` — it cannot outrank a portal that
 * lands beside it. What is not fine is a *portalled* surface bidding higher.
 * Adding an entry with that reasoning written beside it is the workflow.
 */

/**
 * CSS and template comments alike — this file's own prose names z-indexes, and
 * so does the rule it guards. Blanked rather than stripped so line numbers in a
 * failure still point at the source.
 */
const blankComments = (text: string) => text
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
  .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''))

const CSS = blankComments(readFileSync(MAIN_CSS, 'utf8'))

/** The class the layout hands `UDashboardSearch`, read rather than assumed. */
const MARKER = readFileSync(LAYOUT, 'utf8')
  // `\s` and not `[\s\S]`: `<UDashboardSearchButton` sits above it in the same
  // file and would otherwise match first, swallowing everything up to the first
  // self-closing tag inside its slot.
  .match(/<UDashboardSearch\s[\s\S]*?\/>/)?.[0]
  .match(/\sclass="([^"]*)"/)?.[1]
  ?.trim()

/** The rule that raises it, and the level it raises it to. */
const PALETTE_RULE = CSS.match(/(^|\n)([^{}]*\.palette-on-top[^{}]*)\{([^}]*)\}/)
const PALETTE_SELECTOR = PALETTE_RULE?.[2] ?? ''
const PALETTE_Z = Number(PALETTE_RULE?.[3].match(/z-index:\s*(\d+)/)?.[1])

/**
 * z-indexes that are allowed to exceed the palette's, with why each cannot
 * actually compete with it.
 */
const ALLOWED: Record<string, string> = {
  '.sortable-drag': 'A card mid-drag, inside #__nuxt — which is `isolate`, so its subtree is one level in <body> and never reaches a portal.'
}

describe('command palette stacking', () => {
  it('the layout marks the palette with the class the rule selects', () => {
    expect(MARKER, `no class= on <UDashboardSearch> in ${relative(ROOT, LAYOUT)}`).toBeTruthy()
    expect(PALETTE_SELECTOR, `no rule for .${MARKER} in main.css`).toContain(`.${MARKER}`)
  })

  it('raises the overlay as well as the content', () => {
    // Content alone leaves the panel bright behind a floating palette. The
    // overlay is a sibling of the content in the same portal and Nuxt UI gives
    // it no class hook, so the rule has to reach it through the marker.
    expect(PALETTE_SELECTOR).toMatch(/\[data-slot=['"]?overlay['"]?\]:has\(\s*\+\s*\.palette-on-top\s*\)/)
    expect(PALETTE_Z).toBeGreaterThan(0)
  })

  it('nothing else in the app outbids it', () => {
    const sources = execSync(`find ${ROOT}/app -name '*.vue' -o -name '*.css' -o -name '*.ts'`, { encoding: 'utf8' })
      .trim().split('\n')

    const higher: string[] = []
    for (const file of sources) {
      const text = blankComments(readFileSync(file, 'utf8'))
      // Both spellings: the CSS property, and Tailwind's `z-40` / `z-[60]`.
      const values: Array<readonly [string, string, number]> = [
        ...[...text.matchAll(/z-index:\s*(\d+)/g)].map(m => [m[1]!, m[0], m.index] as const),
        ...[...text.matchAll(/(?:^|[\s"'`:])-?z-\[?(\d+)\]?(?![\w-])/g)].map(m => [m[1]!, m[0].trim(), m.index] as const)
      ]
      for (const [value, written, at] of values) {
        if (Number(value) <= PALETTE_Z) continue
        // The selector precedes its declaration, so an exemption is claimed by
        // the rule the value sits in — not by merely naming it in the file.
        const rule = text.slice(Math.max(0, at - 300), at)
        if (!Object.keys(ALLOWED).some(sel => rule.includes(sel))) {
          higher.push(`${relative(ROOT, file)}: ${written}`)
        }
      }
    }

    expect(higher, `above the palette's z-index of ${PALETTE_Z}. Either lower it, or add it to ALLOWED with the reason it cannot compete.`).toEqual([])
  })
})
