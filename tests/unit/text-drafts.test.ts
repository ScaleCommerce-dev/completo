import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const CARD_MODAL = read('app/components/CardModal.vue')
const CARD_PAGE = read('app/pages/projects/[slug]/cards/[cardId].vue')
const COMMENT_LIST = read('app/components/CommentList.vue')
const DRAFT = read('app/composables/useTextDraft.ts')

/** Comments stripped: the prose in these files names the very code being asserted. */
const strip = (src: string) => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

/**
 * These are source-level guards, in the style of `optimistic-reactivity.test.ts`:
 * the unit project runs in `node` and these composables lean on Nuxt's
 * auto-imports, so they cannot be mounted and exercised here. What can be
 * checked is the wiring, and the wiring is exactly what went wrong — see below.
 */

/**
 * `useTextDraft` shipped with zero call sites and nothing noticed, while
 * CLAUDE.md described it as the reason the card panel no longer needs a blocking
 * unsaved-text confirmation. A composable that is documented as load-bearing and
 * imported by nobody is worse than one that doesn't exist: it makes the docs lie.
 */
describe('every editor persists its text', () => {
  const surfaces: Array<[string, string, number]> = [
    ['CardModal', CARD_MODAL, 1],
    ['the card detail page', CARD_PAGE, 1],
    // The new-comment box and an in-progress comment edit.
    ['CommentList', COMMENT_LIST, 2]
  ]

  /**
   * The names bound from `useTextDraft(...)`, so the calls below can be tied to the
   * drafts themselves. `.load()` and `.clear()` on their own match any object at
   * all — a `route.query`, a form ref — which is what these two assertions used to
   * do.
   */
  const handles = (src: string) => [...src.matchAll(/const (\w+) = useTextDraft\(/g)].map(m => m[1]!)

  it.each(surfaces)('%s calls useTextDraft', (_name, src, count) => {
    expect(src.match(/useTextDraft\(/g) ?? []).toHaveLength(count)
    // Every call is bound to a name, or nothing below can be attributed to it.
    expect(handles(src)).toHaveLength(count)
  })

  it.each(surfaces)('%s restores its draft rather than only writing one', (_name, src) => {
    // A draft that is written and never read is a leak, not a safety net.
    for (const handle of handles(src)) expect(src, handle).toMatch(new RegExp(`\\b${handle}\\.load\\(\\)`))
  })

  it.each(surfaces)('%s clears the draft once the text has a home', (_name, src) => {
    for (const handle of handles(src)) expect(src, handle).toMatch(new RegExp(`\\b${handle}\\.clear\\(\\)`))
  })
})

/**
 * Scopes key into one shared localStorage namespace. Two fields sharing one
 * would silently overwrite each other — a comment draft landing in the
 * description, which reads as data corruption rather than a lost draft.
 */
describe('draft scopes', () => {
  /** The field part of `card:<id>:<field>`, with the card id interpolation removed. */
  function fields(src: string): string[] {
    return [...src.matchAll(/`card:\$\{[^}]+\}:([a-z:${}.\w]*)`/g)]
      .map(m => m[1]!.replace(/\$\{[^}]+\}/g, '<id>'))
  }

  it('gives each field its own key', () => {
    const all = [...fields(CARD_MODAL), ...fields(CARD_PAGE), ...fields(COMMENT_LIST)]

    expect(new Set(all)).toEqual(new Set(['description', 'comment', 'comment:<id>']))
  })

  it('uses one key for the description across both card surfaces', () => {
    // Not an accident, and the reason the previous version of this test was
    // wrong: the panel and the full page edit the same field of the same card,
    // so a draft begun in one has to be waiting in the other. Scoping by surface
    // would strand it wherever it was typed.
    expect(fields(CARD_MODAL)).toEqual(['description'])
    expect(fields(CARD_PAGE)).toEqual(['description'])
  })

  it('namespaces storage so a draft cannot collide with anything else', () => {
    expect(DRAFT).toContain('completo:draft:')
  })

  it('treats text equal to the stored value as no draft at all', () => {
    // Without this the composable stores the description of every card merely
    // opened, and would then "restore" text nobody typed.
    //
    // Comments stripped, and the comparison itself required: the JSDoc on the
    // parameter carries the word, so `toMatch(/baseline/)` stayed green with the
    // parameter and the comparison both deleted.
    const code = DRAFT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

    expect(code).toMatch(/baseline/)
    expect(code).toMatch(/toValue\(baseline\)/)
  })
})

/**
 * Regression guard for two shipped bugs, both fixed together because the fix for
 * one depends on the other.
 */
describe('leaving an editor cannot lose text silently', () => {
  const editors: Array<[string, string]> = [
    ['CardModal', CARD_MODAL],
    ['the card detail page', CARD_PAGE]
  ]

  it('routes escape through cancel rather than closing the editor', () => {
    // `@escape="editingDescription = false"` unmounted the editor while leaving
    // the typed text in `description`, so the surface rendered *unsaved* text as
    // prose — indistinguishable from a saved description — and the close guard,
    // which keyed off `editingDescription`, went quiet along with it.
    //
    // The editor moved into `CardDescriptionSection`, so escape is now one hop
    // longer: the section turns it into `cancel`, and each surface reverts. Both
    // hops are asserted, because either alone would let the text survive.
    const section = read('app/components/CardDescriptionSection.vue')
    expect(section).not.toMatch(/@escape="editing = false"/)
    expect(section).toMatch(/@escape="emit\('cancel'\)"/)
  })

  it.each(editors)('%s reverts the description when the editor cancels', (_name, src) => {
    expect(src).toMatch(/@cancel="cancelEditingDescription"/)
    expect(src).toMatch(/function cancelEditingDescription/)
    // The revert itself: local text goes back to what the server holds.
    expect(strip(src)).toMatch(/description\.value = (?:card|c)[^\n]*description/)
  })

  it('CardModal only submits what the Save button would accept', () => {
    // `submit()` guarded on title+status, never on `canSubmit`, so ⌘↵ on a card
    // nobody had edited still issued a PUT and moved `updatedAt` — reading a
    // card and dismissing it with the keyboard marked it as changed.
    expect(CARD_MODAL).toMatch(/function submit\(\)\s*\{[^}]*!canSubmit\.value/)
  })

  it('CardModal no longer blocks a close over text that is now persisted', () => {
    // The confirmation and the drafts are alternatives, not layers. Keeping both
    // means asking permission to do something that cannot lose anything.
    expect(CARD_MODAL).not.toMatch(/showTextDiscardConfirm/)
  })
})

/**
 * The panel navigates between cards without remounting, so a draft's scope
 * changes underneath a live component. That produced the worst bug on this
 * branch: an unposted comment on card A stayed in the composer on card B and
 * Comment posted it there.
 *
 * Source-level for the reason at the top of this file — the composable cannot be
 * mounted here. What each assertion pins is a mechanism the fix depends on, not
 * a spelling: drop any one of them and the leak returns.
 */
describe('a scope change cannot carry text onto the next card', () => {
  const code = DRAFT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

  it('CommentList empties every editor before restoring the new card\'s draft', () => {
    // `load()` only *assigns* when the new card has a stored draft, so on a card
    // with none it left the previous card's text in place. The reset has to
    // happen in the watcher and before the load, or it restores nothing over
    // text that is already wrong.
    const watcher = COMMENT_LIST.match(/watch\(cardIdRef,[\s\S]*?\}, \{ immediate: true \}\)/)?.[0]
    expect(watcher, 'the cardIdRef watcher').toBeTruthy()
    expect(watcher).toMatch(/draft\.value = ''/)
    expect(watcher).toMatch(/editingId\.value = null/)
    // Ordering: nulling the edit id first drops that draft's scope to null, so
    // clearing its text cannot file it under `card:<new>:comment:<old>`.
    expect(watcher!.indexOf('editingId.value = null')).toBeLessThan(watcher!.indexOf('editDraft.value = \'\''))
    expect(watcher!.indexOf('draft.value = \'\'')).toBeLessThan(watcher!.indexOf('commentDraft.load()'))
  })

  it('the pending write remembers which card it belongs to', () => {
    // Deciding the target when the timer fires reads a scope that may already
    // have moved on, which files one card's text under another's key.
    expect(code).toMatch(/pending\s*[:=]/)
    expect(code).toMatch(/pending = \{ scope/)
    expect(code).toMatch(/write\(\w+\.scope,/)
  })

  it('a scope change flushes before the new scope can claim the text', () => {
    expect(code).toMatch(/watch\(resolvedScope[\s\S]{0,60}flush\(\)/)
  })

  it('the source watcher is synchronous so the scope is pinned to the edit', () => {
    // A default pre-flush watcher runs after the tick's prop updates, so typing
    // on card A and navigating in the same tick captured B's scope for A's text.
    // Verified in a browser: without this the draft was lost on that path.
    expect(code).toMatch(/watch\(source[\s\S]*?flush: 'sync'/)
  })

  it('an explicit discard cancels a write already on the timer', () => {
    // Otherwise `clear()` removes the key and the pending write puts it back
    // 400ms later — the one case where restoring text is the wrong answer.
    expect(code).toMatch(/function clear\(\)\s*\{\s*cancel\(\)/)
  })
})
