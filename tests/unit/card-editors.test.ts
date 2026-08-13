import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const CARD_MODAL = read('app/components/CardModal.vue')
const CARD_PAGE = read('app/pages/projects/[slug]/cards/[cardId].vue')

/**
 * A card has exactly one field left that is saved rather than saving itself: the
 * description. Everything else — status, assignee, priority, due date, tags,
 * title — commits on change, on the board, in a list, in the panel and on the
 * page alike.
 *
 * The description's Save therefore belongs to the *editor*, not to the surface.
 * It used to be the panel's footer button and the rail's block button, which put
 * it in a different region from the text it committed — past the attachments and
 * every comment on a card with a thread — and left a permanently-disabled Save
 * sitting on every card nobody was editing.
 */
describe('the card surfaces have no surface-level save', () => {
  const surfaces: Array<[string, string]> = [
    ['CardModal', CARD_MODAL],
    ['the card detail page', CARD_PAGE]
  ]

  it.each(surfaces)('%s has exactly one Save, and it carries the shortcut', (_name, src) => {
    // The surviving Save is the description editor's: its label is followed
    // immediately by the ⌘↵ keys, which is what distinguishes it from a bar
    // button. A second Save anywhere would be a surface-level one returning.
    const editorSaves = [...src.matchAll(/>\s*Save\s*<UKbd value="meta"/g)]

    expect(editorSaves).toHaveLength(1)
    expect(src).not.toMatch(/label="Save"/)
    expect(src).not.toMatch(/'Save'/)
  })

  it.each(surfaces)('%s guards the description save on the description changing', (_name, src) => {
    expect(src).toMatch(/descriptionDirty/)
    expect(src).toMatch(/:disabled="!descriptionDirty"/)
  })

  it('CardModal keeps a footer only while creating', () => {
    // An existing card has nothing to batch, so the pinned bar goes and the body
    // gets the height back.
    expect(CARD_MODAL).toMatch(/v-if="!isEdit"\s*#footer/)
  })
})

/**
 * ⌘↵ commits the editor you are in. The routing is three-way and each branch was
 * a bug at some point: it used to save-and-close the card from anywhere, which is
 * how reading a card and dismissing it marked the card as changed.
 */
describe('the shortcut belongs to an editor', () => {
  it('lets a comment editor claim it first, by containment', () => {
    // Containment rather than listener order, so neither side depends on which
    // component mounted first.
    for (const src of [CARD_MODAL, CARD_PAGE]) {
      expect(src).toMatch(/closest\?\.\('\[data-comment-editor\]'\)/)
    }
  })

  it('does nothing on an existing card with no editor open', () => {
    // The branch that used to fall through to a card-level submit.
    expect(CARD_MODAL).toMatch(/if \(!editingDescription\.value\) return/)
    expect(CARD_PAGE).toMatch(/if \(!editingDescription\.value\) return/)
  })
})

/**
 * An empty section says what goes there by offering it, rather than by printing
 * a sentence about its own emptiness or — worse — rendering a heading with
 * nothing under it, which reads as a section that failed to load. A card with
 * nothing on it used to show two of those in a row.
 */
describe('empty sections are their own invitation', () => {
  const surfaces: Array<[string, string]> = [
    ['CardModal', CARD_MODAL],
    ['the card detail page', CARD_PAGE]
  ]

  it.each(surfaces)('%s offers the description instead of leaving a void', (_name, src) => {
    expect(src).toContain('Add a description…')
  })

  it.each(surfaces)('%s drops the header button when there is nothing to edit', (_name, src) => {
    // Two invitations to write the same paragraph is one too many, and the
    // header one was a 19px hit target in ~2.5:1 grey.
    expect(src).toMatch(/v-if="!editingDescription && description"/)
    expect(src).not.toMatch(/'Edit' : 'Add'/)
  })

  it('the comment composer is the comments empty state', () => {
    const comments = read('app/components/CommentList.vue')

    expect(comments).toContain('Leave a comment…')
    // The sentence reported the fact; the collapsed row reports it and offers
    // the action, so the sentence is redundant. Matched as a rendered text node,
    // since the prose above explains why it went and would match a plain
    // substring check.
    expect(comments).not.toMatch(/>\s*No comments yet\s*</)
  })

  it('the comment editor stops telling people to describe the task', () => {
    // MarkdownEditor's default placeholder belongs to a card description, and
    // the comment boxes reuse the component.
    const comments = read('app/components/CommentList.vue')
    const editor = read('app/components/DescriptionEditor.vue')

    expect(editor).toMatch(/placeholder\?:/)
    expect(comments).toMatch(/placeholder="Leave a comment…"/)
  })
})

/**
 * The trap that cost a debugging round: `USlideover`'s default slot is its
 * *trigger*. A dialog placed there renders into the page behind the panel —
 * centred, with its buttons under the panel's left edge and unreachable — and it
 * looks like a z-index problem rather than a slot one.
 */
describe('the delete confirmation is not inside the slideover', () => {
  it('places UiConfirmDialog after the panel closes', () => {
    const panelEnd = CARD_MODAL.indexOf('</USlideover>')
    const dialog = CARD_MODAL.indexOf('<UiConfirmDialog')

    expect(panelEnd).toBeGreaterThan(-1)
    expect(dialog).toBeGreaterThan(panelEnd)
  })
})

/**
 * `UiConfirmDialog` is the one destructive idiom, and this pair were the last two
 * hand-rolled holdouts — an inline banner in the panel's footer and a second one
 * in the page's rail, with its own red hex values.
 */
describe('one destructive idiom', () => {
  const surfaces: Array<[string, string]> = [
    ['CardModal', CARD_MODAL],
    ['the card detail page', CARD_PAGE]
  ]

  it.each(surfaces)('%s confirms a delete through UiConfirmDialog', (_name, src) => {
    expect(src).toContain('<UiConfirmDialog')
  })

  it('the card page no longer paints its own destructive button', () => {
    // `bg-red-500` on a hand-built button, which dark mode had to be maintained
    // for by hand — see the token rule in CLAUDE.md.
    expect(CARD_PAGE).not.toMatch(/bg-red-500/)
  })
})
