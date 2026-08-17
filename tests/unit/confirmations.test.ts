import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')

/**
 * One confirmation vocabulary, two mounts.
 *
 * `ui/ConfirmDialog` where a page can raise a dialog; `ui/InlineConfirm` where it
 * cannot — inside the card panel, where a second dialog portals *behind* the panel,
 * and in dense repeated rows where a centred dialog loses the row you were pointing
 * at. Both take the same two levels, selected by the same prop, so "type the name"
 * means the same thing in either.
 *
 * The behaviour worth guarding hardest is the two-step timer's direction. Four sites
 * used it to disarm; `useApiTokens` used it to *commit*, so arming an API token's
 * delete and walking away revoked the token five seconds later. That shipped in
 * every release. It is the kind of defect that only shows up when five copies are
 * read side by side, which is the argument for there being one.
 */

/** Comments blanked, since this file's own prose and the components' both describe what they ban. */
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
  .replace(/\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ''))
  .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''))

const SOURCES = execSync(`find ${ROOT}/app -name '*.vue' -o -name '*.ts'`, { encoding: 'utf8' })
  .trim().split('\n').map(f => relative(ROOT, f))

/**
 * `setTimeout`'s first argument, from just past its opening paren — brace-balanced
 * for an arrow body, otherwise up to the argument separator. Reading the callback
 * is what separates a timer that deletes from a timer that merely sits near a
 * function whose name contains "delete".
 */
function callbackOf(source: string, from: number): string {
  const brace = source.indexOf('{', from)
  const comma = source.indexOf(',', from)
  if (brace === -1 || (comma !== -1 && comma < brace)) {
    return source.slice(from, comma === -1 ? from : comma)
  }

  let depth = 0
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(from, i + 1)
  }

  return source.slice(from, brace)
}

const ARMED = 'app/composables/useArmedDelete.ts'
const INLINE = 'app/components/ui/InlineConfirm.vue'
const DIALOG = 'app/components/ui/ConfirmDialog.vue'

describe('the two-step delete', () => {
  it('disarms on its timer, and never commits', () => {
    // The whole contract. `setTimeout(disarm, …)` and nothing else: a callback that
    // calls the confirm path turns a confirmation into a delayed action.
    const source = code(ARMED)
    const timers = [...source.matchAll(/setTimeout\(\s*([^,]+),/g)].map(m => m[1]!.trim())

    expect(timers, 'exactly one timer').toHaveLength(1)
    expect(timers[0], 'the timer must disarm, not confirm').toBe('disarm')
    expect(source, 'disarm clears the pending timer, or arming twice leaks one').toMatch(/function disarm\(\)[^}]*clearTimeout\(timer\)/s)
  })

  it('no timer anywhere else completes a delete', () => {
    // Other timers are fine and plentiful — a copied-to-clipboard flag, a slug
    // debounce, the board's scroll restore. What may not exist again is a timer whose
    // *callback* performs the deletion, which is the shape that shipped. Read from
    // the callback rather than from text near the call, or a `confirmDeleteToken`
    // declared twenty lines below an unrelated timer reads as the offence.
    const offenders: string[] = []
    for (const file of SOURCES) {
      if (file === ARMED) continue
      const source = code(file)
      for (const m of source.matchAll(/setTimeout\(/g)) {
        const callback = callbackOf(source, m.index + m[0].length)
        // A *call* to the confirm path. `Map.delete(…)` and a `function
        // confirmDeleteToken(…)` declaration are not it, which is what a fixed
        // window of characters could not tell apart.
        if (/\bconfirm[A-Z]\w*\(/.test(callback)) {
          offenders.push(`${file}: ${callback.replace(/\s+/g, ' ').slice(0, 70)}`)
        }
      }
    }

    expect(offenders, 'a timer must disarm, never delete').toEqual([])
  })

  it('is what every row list uses for its armed state', () => {
    // Derived, and it follows one hop: `ProfileTokens` renders the row but its armed
    // state comes from `useApiTokens`, which is where the broken timer lived. A check
    // that only looked at the rendering file would have called that clean.
    const usesArmed = (source: string) => /useArmedDelete\(/.test(source)
      || /\barmedId\b|\bisArmed\b/.test(source)

    const composableSources = new Map(
      SOURCES.filter(f => f.startsWith('app/composables/')).map(f => [
        f.replace(/^app\/composables\//, '').replace(/\.ts$/, ''),
        code(f)
      ])
    )

    const usesInline = SOURCES.filter(f => /<UiInlineConfirm[\s>/]/.test(code(f)))
    expect(usesInline.length, 'nothing renders the inline confirm').toBeGreaterThan(0)

    for (const file of usesInline) {
      const source = code(file)
      // `ProjectForm` is the banner level, driven by a plain flag rather than an
      // armed row — there is one project being deleted, not one of twenty rows.
      if (/confirm-text=|:confirm-text/.test(source)) continue

      const viaComposable = [...source.matchAll(/\b(use[A-Z]\w*)\(/g)]
        .some(m => usesArmed(composableSources.get(m[1]!) ?? ''))

      expect(
        usesArmed(source) || viaComposable,
        `${file} renders the compact row without useArmedDelete behind it`
      ).toBe(true)
    }
  })
})

describe('one vocabulary, two mounts', () => {
  it('both mounts pick the level with the same prop', () => {
    // Not two components that happen to look alike: `confirmText` present means
    // "type the name" in both, so the level a user meets does not depend on whether
    // the surface could raise a dialog.
    for (const file of [DIALOG, INLINE]) {
      const source = code(file)
      expect(source, `${file} takes confirmText`).toMatch(/confirmText\?: string/)
      expect(source, `${file} gates the typed field on it`).toMatch(/confirmText/)
    }
    expect(code(INLINE), 'the inline mount branches on the level').toMatch(/v-if="confirmText"/)
  })

  it('the compact row is spelled once', () => {
    // "Delete?" is the label a hand-rolled two-step has to write, so it is the
    // cheapest thing to count. Four files carried it; one does.
    const carriers = SOURCES.filter(f => /Delete\?/.test(code(f)))
    expect(carriers).toEqual([INLINE])
  })

  it('names both of its controls', () => {
    // Three of the four rows this replaced had two icon-only buttons with no
    // accessible name — the tick and the cross announced nothing at all.
    const source = code(INLINE)
    const compact = source.slice(source.indexOf('v-else'))
    const labels = [...compact.matchAll(/:aria-label="`([^`]+)`"/g)].map(m => m[1]!)

    expect(labels).toHaveLength(2)
    expect(labels.every(l => l.includes('${label}')), 'both names carry the subject').toBe(true)
    expect(new Set(labels).size, 'the two controls must not announce the same thing').toBe(2)
  })

  it('keeps the destructive control first in the row, and last in the banner', () => {
    // Deliberately different, and the reason is the pointer. The armed row replaces a
    // trash icon in place, so the tick lands where the pointer already is and the
    // second click completes the gesture; putting Cancel there would make the natural
    // second click the one that abandons. The banner leads with a field, so its
    // terminal end is the right one — which is the rule everywhere a field is
    // involved (see `UiCommitRow` / `UiSaveBar`).
    const source = code(INLINE)
    const banner = source.slice(source.indexOf('v-if="confirmText"'), source.indexOf('v-else'))
    const compact = source.slice(source.indexOf('v-else'))

    expect(compact.indexOf('lucide-check')).toBeLessThan(compact.indexOf('lucide-x'))
    expect(banner.indexOf('Cancel')).toBeLessThan(banner.indexOf('lucide-trash-2'))
  })
})
