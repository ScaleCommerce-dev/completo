import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const KEY_COMPONENT = 'app/components/ui/Key.vue'

function vueFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(rel)
    return entry.name.endsWith('.vue') ? [rel] : []
  })
}

const SURFACES = [...vueFiles('app/components'), ...vueFiles('app/pages'), ...vueFiles('app/layouts')]
  .filter(p => p !== KEY_COMPONENT)

/**
 * Keyboard keys are drawn, not typed.
 *
 * `UKbd` renders a key as a *character*, and measured in Chrome neither of this
 * app's fonts has most of them:
 *
 *   JetBrains Mono     ↑ ok  ↓ ok  ← miss  → miss  ⌘ miss  ↵ miss
 *   Plus Jakarta Sans  ↑ ok  ↓ ok  ← miss  → miss  ⌘ miss  ↵ miss
 *
 * A missing glyph falls back to whatever the OS offers, at a different weight
 * and optical size — so ↑ and ↓ came out crisp while ← and → beside them were a
 * smudge, and each browser drew a different thing. No font stack fixed it
 * either: `system-ui` covers ⌘ and the arrows but still misses ↵.
 *
 * So every key goes through `UiKey`, which substitutes an icon for the six the
 * fonts lack and leaves letters as letters.
 */
describe('every keyboard key is drawn rather than typed', () => {
  /**
   * Prose explains *why* these glyphs are avoided, and it names them to do it, so
   * every comment style has to go before the source is searched — including `//`
   * line comments, which is where the rule ends up being written when it is written
   * inside `<script setup>`. `[^:\w]` before the slashes keeps `https://` intact.
   */
  const code = (path: string) => readFileSync(join(ROOT, path), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

  it.each(SURFACES)('%s does not render a raw key glyph', (path) => {
    const src = code(path)

    expect(src).not.toMatch(/[⌘↵⏎⌥⇧⎋]/)
    expect(src).not.toMatch(/&#(8984|8629|9166);|&#x(2318|21B5|23CE);/i)
    expect(src).not.toMatch(/<kbd[\s>]/)
  })

  it.each(SURFACES)('%s uses UiKey rather than UKbd directly', (path) => {
    expect(code(path)).not.toMatch(/<UKbd[\s/>]/)
  })

  it('substitutes an icon for exactly the keys the fonts lack', () => {
    const key = readFileSync(join(ROOT, KEY_COMPONENT), 'utf8')

    for (const name of ['meta', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']) {
      expect(key, name).toMatch(new RegExp(`${name}: 'i-lucide-`))
    }
  })

  it('sizes the icon against the key it sits in', () => {
    // `em`, so one rule covers every UKbd size. 1em rather than something matched
    // to a letter's cap height: ⌘ is four interlocking loops and turns to mush
    // below the font size, where a letter survives.
    const key = readFileSync(join(ROOT, KEY_COMPONENT), 'utf8')
    // Split into tokens: `not.toMatch(/class="size-\d/)` only fired when a fixed
    // size was the *first* utility in the attribute, so `class="shrink-0 size-3"`
    // — the likelier spelling of the mistake — passed.
    const sizes = [...key.matchAll(/class="([^"]*)"/g)]
      .flatMap(m => m[1]!.split(/\s+/))
      .filter(t => /^size-\d/.test(t))

    expect(key).toContain('size-[1em]')
    expect(sizes).toEqual([])
  })
})
