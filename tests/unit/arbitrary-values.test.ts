import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')

/**
 * The rule `--spacing-column` exists to express, and which nothing enforced.
 *
 * A one-off arbitrary value is not a defect. `min-h-[26px]` in UiFieldRow is a
 * measurement of that one component, and forcing it into `@theme` would make the
 * theme a dumping ground — a guard that banned every arbitrary value would cost
 * more than it caught. What is a defect is the *second* file that types the same
 * literal, because at that point the value is shared vocabulary kept in two
 * places, and the next person to retune it will find one of them. The board
 * column width was `w-[280px]` in two files; tracking was nine values over 61
 * sites; the list-cell height was copied into seven sibling components. Each was
 * found by hand, long after it was written.
 *
 * So the invariant is duplication itself, not a list of blessed values: nothing
 * here restates what the scale contains, which is why it cannot desync from it.
 */

/**
 * The families policed. Both have a named scale, so a repeated literal in them
 * has somewhere to go — that is the entry condition, and it is asserted against
 * `@theme` below rather than assumed.
 *
 * Deliberately not "every Tailwind namespace". `--spacing-*` also backs `w-*`,
 * `p-*` and `size-*`, where the app's remaining literals are genuine
 * one-per-component measurements (a 380px auth card, a 132px label column).
 * Widening to those would flag them without a token being owed.
 *
 * Keyed by utility prefix, valued with the `@theme` namespace its named values
 * resolve out of.
 */
const FAMILIES: Record<string, string> = {
  'tracking': 'tracking',
  'min-h': 'spacing'
}

const blankLines = (text: string) => text.replace(/[^\n]/g, '')

/** Every file that can carry a utility class: markup, and the config that themes it. */
const SOURCES = execSync(`find ${ROOT}/app -name '*.vue' -o -name '*.ts'`, { encoding: 'utf8' })
  .trim()
  .split('\n')

/** The declarations of every `@theme` block, comments blanked. */
const THEME = [...readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, blankLines)
  .matchAll(/@theme[^{]*\{[\s\S]*?\n\}/g)]
  .map(m => m[0])
  .join('\n')

/**
 * `family-[value]` → the files that spell it, keyed by the utility as written.
 *
 * Comments are blanked first, for the same reason `design-tokens.test.ts` blanks
 * them: the prose explaining why a literal was replaced names the literal.
 * `main.css` documents the tracking tokens by quoting the spellings they
 * replaced, and every one-off kept below carries a comment saying which value it
 * is and why it stayed. Matched against raw text this guard would fail on its own
 * documentation — or worse, pass because the prose was the match it found.
 */
const LITERALS: Record<string, string[]> = {}

for (const file of SOURCES) {
  const markup = readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, blankLines)
    .replace(/\/\*[\s\S]*?\*\//g, blankLines)
    .replace(/^\s*\/\/.*$/gm, blankLines)

  for (const family of Object.keys(FAMILIES)) {
    for (const match of markup.matchAll(new RegExp(`\\b${family}-\\[([^\\]]+)\\]`, 'g'))) {
      const utility = `${family}-[${match[1]}]`
      const files = LITERALS[utility] ??= []
      const path = relative(ROOT, file)

      if (!files.includes(path)) files.push(path)
    }
  }
}

describe('arbitrary values', () => {
  it('every policed family has a named scale to migrate into', () => {
    for (const [family, namespace] of Object.entries(FAMILIES)) {
      const named = [...THEME.matchAll(new RegExp(`^\\s*--${namespace}-([a-z][a-z0-9-]*):`, 'gm'))]

      expect(named, `--${namespace}-* is empty, so ${family}-[…] has nowhere to go`)
        .not.toHaveLength(0)
    }
  })

  it('no arbitrary value is spelled in more than one file', () => {
    const shared = Object.entries(LITERALS)
      .filter(([, files]) => files.length > 1)
      .map(([utility, files]) => `${utility} — ${[...files].sort().join(', ')}`)
      .sort()

    expect(shared, 'a value two files agree on is shared vocabulary; name it in @theme').toEqual([])
  })

  // There used to be a counterpart here asserting that at least one one-off
  // literal *exists* — a canary for the guard above going vacuous. It mandated
  // the presence of arbitrary values, so a design pass that legitimately
  // tokenised the last one would fail CI for making the app cleaner. A guard
  // must never fail because the defect it polices has been fully removed.
})
