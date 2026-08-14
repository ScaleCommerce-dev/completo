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
  it.each(SURFACES)('%s does not render a raw key glyph', (path) => {
    const src = readFileSync(join(ROOT, path), 'utf8')
      // Prose in comments explains *why* these glyphs are avoided.
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    expect(src).not.toMatch(/[⌘↵⏎⌥⇧⎋]/)
    expect(src).not.toMatch(/&#(8984|8629|9166);|&#x(2318|21B5|23CE);/i)
    expect(src).not.toMatch(/<kbd[\s>]/)
  })

  it.each(SURFACES)('%s uses UiKey rather than UKbd directly', (path) => {
    const src = readFileSync(join(ROOT, path), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

    expect(src).not.toMatch(/<UKbd[\s/>]/)
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

    expect(key).toContain('size-[1em]')
    expect(key).not.toMatch(/class="size-\d/)
  })
})
