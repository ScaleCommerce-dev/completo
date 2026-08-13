import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const CARD_MODAL = read('app/components/CardModal.vue')
const CARD_PAGE = read('app/pages/projects/[slug]/cards/[cardId].vue')
const COMMENT_LIST = read('app/components/CommentList.vue')
const DRAFT = read('app/composables/useTextDraft.ts')

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

  it.each(surfaces)('%s calls useTextDraft', (_name, src, count) => {
    expect(src.match(/useTextDraft\(/g) ?? []).toHaveLength(count)
  })

  it.each(surfaces)('%s restores its draft rather than only writing one', (_name, src) => {
    // A draft that is written and never read is a leak, not a safety net.
    expect(src).toMatch(/\.load\(\)/)
  })

  it.each(surfaces)('%s clears the draft once the text has a home', (_name, src) => {
    expect(src).toMatch(/\.clear\(\)/)
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
    expect(DRAFT).toMatch(/baseline/)
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

  it.each(editors)('%s reverts on escape instead of just closing the editor', (_name, src) => {
    // `@escape="editingDescription = false"` unmounted the editor while leaving
    // the typed text in `description`, so the panel rendered *unsaved* text as
    // prose — indistinguishable from a saved description — and the close guard,
    // which keyed off `editingDescription`, went quiet along with it.
    expect(src).not.toMatch(/@escape="editingDescription = false"/)
    expect(src).toMatch(/@escape="cancelEditingDescription"/)
    expect(src).toMatch(/function cancelEditingDescription/)
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
