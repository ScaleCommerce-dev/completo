import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
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
    const editorSaves = [...src.matchAll(/>\s*Save\s*<UiKey value="meta"/g)]

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

  it.each(surfaces)('%s offers Copy and Edit only where there is prose', (_name, src) => {
    // Two invitations to write the same paragraph is one too many, so the pair
    // belongs to the branch that renders a description, never to the empty one —
    // there the placeholder row is itself the button.
    const readMode = src.slice(src.indexOf('v-else-if="description"'))
    const empty = src.indexOf('Add a description…')

    expect(readMode).toContain('aria-label="Edit the description"')
    expect(readMode).toContain('aria-label="Copy the description as Markdown"')
    expect(src.indexOf('aria-label="Edit the description"')).toBeLessThan(empty)
    expect(src).not.toMatch(/'Edit' : 'Add'/)
  })

  it.each(surfaces)('%s puts the three empty rows in one vocabulary', (_name, src) => {
    // An empty section is one row — icon, verb, border — and no heading above it.
    // The description's placeholder is the same object as the collapsed comment
    // composer, down to the classes.
    expect(src).toMatch(/rounded-lg border border-default bg-default px-3 py-2[\s\S]{0,400}Add a description…/)
    expect(src).toContain('i-lucide-text')
  })

  it('spends the dashed border on the drag state, not on resting', () => {
    // It was permanently dashed, which at 1px reads as *fainter* rather than as a
    // different kind of thing — two solid rows and one dashed 24px apart looked
    // like an inconsistency. The dash now arrives with the primary border and
    // "Drop to upload", where it is legible and means something.
    const attachments = read('app/components/AttachmentList.vue')
    const rest = attachments.match(/: '(border-default[^']*)'/)?.[1] ?? ''

    expect(rest).not.toContain('border-dashed')
    expect(attachments).toMatch(/dragging\s*\?\s*'border-dashed border-primary/)
  })

  it('leaves the empty sections unlabelled, so no heading sits over a void', () => {
    // The count is what the label is *for*, and there is nothing to count until
    // the section has something in it. Both gate on that rather than on `|| null`,
    // which used to render the heading with the number simply absent.
    for (const path of ['app/components/AttachmentList.vue', 'app/components/CommentList.vue']) {
      const src = read(path)
      expect(src, path).toMatch(/<UiSectionLabel\s+v-if="(attachments|comments)\.length"/)
    }
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
 * The panel's body scrolls under its pinned header, which stays put by design so
 * status and assignee remain readable while you read the comments. Against an
 * opaque edge that sliced text horizontally mid-line — half-glyphs, a shape text
 * never makes on its own, so it reads as a rendering fault rather than as "there
 * is more above".
 */
describe('the card panel fades its scroll edges', () => {
  it('defines the mask next to the board’s, on the other axis', () => {
    const css = read('app/assets/css/main.css')

    expect(css).toMatch(/\.panel-scroll\s*\{[\s\S]*?--panel-fade-top[\s\S]*?--panel-fade-bottom[\s\S]*?\}/)
  })

  it('applies it to the body USlideover owns', () => {
    expect(CARD_MODAL).toMatch(/body: '[^']*panel-scroll/)
  })

  it('computes each edge separately, so an edge with nothing beyond it stays hard', () => {
    // The board's rule: a surface that fits shows no fade at all, and the bottom
    // only earns one while creating, where there is still a footer bar.
    expect(CARD_MODAL).toMatch(/--panel-fade-top[\s\S]{0,80}scrollTop > 4/)
    expect(CARD_MODAL).toMatch(/--panel-fade-bottom[\s\S]{0,80}scrollTop < max - 4/)
  })

  it('watches the sections, not just the container', () => {
    // Height changes without the panel resizing — comments arrive, the editor
    // opens, a file is attached — and observing only the container would leave
    // the bottom fade lying about whether there is more to read.
    expect(CARD_MODAL).toMatch(/for \(const section of bodyScroller\.children\)/)
  })
})

/**
 * The trap that cost a debugging round: `USlideover`'s default slot is its
 * *trigger*. A dialog placed there renders into the page behind the panel —
 * centred, with its buttons under the panel's left edge and unreachable — and it
 * looks like a z-index problem rather than a slot one.
 *
 * The panel has no dialog of its own any more (the delete confirmation left with
 * the `⋯` menu), so this now guards the rule rather than an instance of it: put
 * one back inside those tags and the panel breaks the same way it did before.
 */
describe('no dialog is nested inside the slideover', () => {
  it('keeps the panel body free of UiConfirmDialog', () => {
    const panelEnd = CARD_MODAL.indexOf('</USlideover>')

    expect(panelEnd).toBeGreaterThan(-1)
    expect(CARD_MODAL.slice(0, panelEnd)).not.toContain('<UiConfirmDialog')
  })
})

/**
 * Chrome the card surfaces share with the rest of the app, and had each grown
 * their own version of.
 */
describe('one spelling per idiom', () => {
  it('gives the card’s remaining sections one heading style', () => {
    // Measured off the rendered panel: 0.48px, 0.84px and 0.30px of tracking on
    // three stacked headings, one of them without the icon its neighbours had —
    // because two hand-rolled the style UiSectionLabel exists to hold.
    for (const path of ['app/components/CommentList.vue', 'app/components/AttachmentList.vue']) {
      expect(read(path), path).toContain('<UiSectionLabel')
      expect(read(path), path).not.toMatch(/text-xs font-semibold uppercase tracking-\[/)
    }
  })

  it('puts no heading over the card’s own body', () => {
    // "DESCRIPTION" labelled the one region on either surface that needs no
    // label — it is what the card *is*, directly under the title — while the two
    // below it label collections worth counting. Three peer headings claimed the
    // three regions were peers; they are a body and two appendices.
    for (const [name, src] of [['CardModal', CARD_MODAL], ['the card page', CARD_PAGE]] as const) {
      expect(src, name).not.toMatch(/label="Description"/)
      expect(src, name).not.toMatch(/text-xs font-semibold uppercase tracking-\[/)
    }
  })

  it('does not turn a click on the prose into an edit', () => {
    // The guard could never cover the gesture people actually use: clicking a
    // word and shift-clicking to extend, or clicking once to drop a previous
    // selection, both start collapsed and so were indistinguishable from "edit
    // this". The hover fill has to go with it — a surface that lights up under the
    // pointer and then does nothing is worse than one that never offered.
    for (const [name, src] of [['CardModal', CARD_MODAL], ['the card page', CARD_PAGE]] as const) {
      expect(src, name).not.toContain('onProseClick')
      expect(src, name).not.toMatch(/hover:bg-muted\/60/)
    }
  })
})

/**
 * A file dropped anywhere on a card attaches it. Before that, the handlers lived
 * on the attachments section's own wrapper, so a screenshot dropped on the
 * description hit the browser's default handler and navigated the tab to
 * `file:///…`, taking the card view with it.
 */
describe('the whole card is the drop target', () => {
  it('is wired from the surface, not from the section that stores the result', () => {
    for (const [name, src] of [['CardModal', CARD_MODAL], ['the card page', CARD_PAGE]] as const) {
      expect(src, name).toContain('useFileDrop(')
      expect(src, name).toMatch(/:dragging="dragging"/)
    }

    // The section no longer owns any of it — it only reports, and uploads what it
    // is handed.
    const attachments = read('app/components/AttachmentList.vue')
    expect(attachments).not.toMatch(/@dragover|@dragenter|@dragleave|@drop/)
    expect(attachments).toMatch(/defineExpose\(\{[^}]*uploadFiles/)
  })

  it('swallows the browser default wherever the file lands', () => {
    const drop = read('app/composables/useFileDrop.ts')

    // Unconditional and ahead of the containment check: this is the call that
    // stops a stray drop leaving the app.
    expect(drop).toMatch(/e\.preventDefault\(\)\n\s*if \(opts\.enabled/)
  })

  it('does not unset the highlight faster than a drag reports itself', () => {
    // The drag-and-drop model re-runs every 350ms, so a stationary pointer over
    // the panel is the slowest legitimate event stream there is and a shorter
    // timeout blinks the highlight off between two normal `dragover`s. Leaving is
    // detected by containment instead; this is only the backstop.
    const drop = read('app/composables/useFileDrop.ts')

    expect(drop).toMatch(/dragging\.value = false\n\s*\}, 500\)/)
    expect(drop).toMatch(/if \(inRoot\(e\.relatedTarget\)\) return/)
  })

  it('puts every ⌘↵ hint on the button it triggers', () => {
    // Three spellings: a floating grey chip beside the button, a raw <kbd>
    // inside it, and UKbd as a trailing slot. UKbd is the one Nuxt UI ships.
    const withShortcuts = [
      'app/components/CardModal.vue',
      'app/components/CommentList.vue',
      'app/components/CreateViewModal.vue',
      'app/components/ProjectForm.vue',
      'app/pages/projects/[slug]/cards/[cardId].vue'
    ]

    for (const path of withShortcuts) {
      expect(read(path), path).not.toMatch(/<kbd/)
    }
  })

  it('lets a long title wrap instead of running off the edge', () => {
    // An <input> showed about 70 characters of a 100-character title, with no
    // ellipsis and no way to read the rest but arrowing through it.
    for (const path of ['app/components/CardModal.vue', 'app/pages/projects/[slug]/cards/[cardId].vue']) {
      const src = read(path)
      expect(src, path).toMatch(/<textarea[\s\S]{0,200}v-model="title"/)
      expect(src, path).toMatch(/function resizeTitle/)
    }
  })

  it('keeps comment row actions quiet until the row is reached', () => {
    // They were lit on every comment, so a thread of five carried ten icons —
    // while the attachment rows beside them were hover-only.
    const comments = read('app/components/CommentList.vue')

    expect(comments).toMatch(/opacity-0 group-hover:opacity-100 focus-within:opacity-100/)
  })
})

/**
 * `UiConfirmDialog` is the one destructive idiom, and this pair were the last two
 * hand-rolled holdouts — an inline banner in the panel's footer and a second one
 * in the page's rail, with its own red hex values.
 */
describe('one destructive idiom', () => {
  it('the card page confirms its delete through UiConfirmDialog', () => {
    expect(CARD_PAGE).toContain('<UiConfirmDialog')
  })

  it('the panel has no delete of its own, and no menu hiding one', () => {
    // The `⋯` menu held exactly one item, so it was a menu whose job was to hide
    // a button: two clicks and a popover in front of an action that already has a
    // confirmation behind it. Deleting a card is the full-page view's, beside the
    // provenance the decision wants.
    expect(CARD_MODAL).not.toContain('i-lucide-ellipsis')
    expect(CARD_MODAL).not.toMatch(/Delete card/)
    expect(CARD_MODAL).not.toMatch(/delete: \[cardId/)
    // And nothing is left bound to the emit that went with it.
    expect(read('app/composables/useViewPage.ts')).not.toMatch(/^\s*handleDeleteCard,$/m)
  })

  it('removing an attachment asks first', () => {
    // It was the only destructive action on either surface with no confirmation
    // at all — one mis-click on a hover-only trash icon. The two-step inline
    // confirm, matching the comment rows directly below it rather than inventing
    // a second answer for the same question in the same list.
    const attachments = read('app/components/AttachmentList.vue')

    expect(attachments).toMatch(/confirmRemoveId/)
    expect(attachments).toMatch(/@click="requestRemove\(attachment\.id\)"/)
    expect(attachments).not.toMatch(/@click="remove\(attachment\.id\)"/)
  })

  it('the card page no longer paints its own destructive button', () => {
    // `bg-red-500` on a hand-built button, which dark mode had to be maintained
    // for by hand — see the token rule in CLAUDE.md.
    expect(CARD_PAGE).not.toMatch(/bg-red-500/)
  })
})

/**
 * Rendered prose is shared by the description on both card surfaces and by every
 * comment, so anything added to it lands in all three at once — which is a reason
 * to be careful about what it lets through.
 */
describe('rendered prose', () => {
  const PROSE = read('app/components/ProseDescription.vue')

  it('decorates code blocks without widening what markdown may render', () => {
    // The tidier-looking version emits the wrapper from marked's own renderer,
    // which means adding `div` to ALLOWED_TAGS — and marked passes raw HTML in a
    // description straight through, so the wrapper would arrive by widening what
    // *user* markdown can render, to buy a button we can build ourselves. This
    // runs on post-sanitize DOM instead.
    expect(PROSE).toMatch(/function decorateCodeBlocks/)
    expect(PROSE).toMatch(/ALLOWED_TAGS: \[[\s\S]*?\]/)
    expect(PROSE.match(/ALLOWED_TAGS: \[[\s\S]*?\]/)![0]).not.toMatch(/'div'/)
  })

  it('reads the language rather than plumbing it', () => {
    // `language-ts` is already on the <code> and `class` is already allowed.
    expect(PROSE).toMatch(/language-\(\[\\w\+#\.-\]\+\)/)
  })

  it('re-decorates after an edit, because v-html discards the wrappers', () => {
    expect(PROSE).toMatch(/watch\(rendered, \(\) => nextTick\(decorateCodeBlocks\)\)/)
  })

  it('takes its palette from the semantic tokens, in one theme-aware copy', () => {
    // This was thirty lines of raw zinc and indigo plus a second copy of itself
    // under `:root.dark` — the hand-maintained dark mode the token rule exists to
    // prevent, which slipped in because design-tokens.test.ts reads utility
    // classes and these are custom properties.
    expect(PROSE).not.toMatch(/--color-(zinc|slate|indigo)-/)

    // What survives is the two values that genuinely differ by theme — a code
    // block wants to sit *below* the page, and `--ui-bg-muted` is lighter than the
    // surface in dark mode — rather than a duplicate of every line above.
    const darkRules = PROSE.match(/:root\.dark \.prose-description/g) || []
    expect(darkRules.length).toBeLessThanOrEqual(2)
  })
})

/**
 * Tags fill one line and `+N` counts what didn't, on a board card and in the card
 * panel's properties row alike — the same argument as priority's edge bar, which
 * KanbanCard and ListView mirror so both views describe priority identically.
 */
describe('tag overflow is measured in one place', () => {
  const USERS = ['app/components/KanbanCard.vue', 'app/components/CardProperties.vue']

  it('is shared rather than reimplemented', () => {
    for (const path of USERS) {
      const src = read(path)
      expect(src, path).toMatch(/useTagOverflow\(\{/)
      expect(src, path).toContain('data-tag')
      // The measurement itself belongs to the composable. A second copy is how
      // the two surfaces would drift into counting differently.
      expect(src, path).not.toMatch(/offsetTop/)
    }
  })

  it('leaves the card page’s rail alone, where nothing is clipped', () => {
    // Measuring an unclipped row counts the tags on lines two and three as hidden
    // and prints a `+N` beside tags that are plainly visible.
    expect(read('app/components/CardProperties.vue')).toMatch(/enabled: \(\) => isCompact\.value/)
  })
})

/**
 * The card page's rail was four sections at three different insets, two label
 * idioms and two kinds of box — a bordered properties group *inside* the bordered
 * card, so its labels sat 25px from the card's edge while the provenance rows
 * beneath them sat at 16 and visibly failed to line up.
 */
describe('the card page rail is one stack', () => {
  it('lets the host own the border, so every row shares one inset', () => {
    // CardProperties' rows layout draws the hairlines and nothing else. There is
    // no UiFieldGroup any more: one consumer, and its only host already had a
    // border.
    const props = read('app/components/CardProperties.vue')

    expect(props).toMatch(/'divide-y divide-default'/)
    expect(props).not.toContain('UiFieldGroup')
    expect(existsSync(join(ROOT, 'app/components/ui/FieldGroup.vue'))).toBe(false)
    // One inset for the rail's rows, matching the sections around them.
    expect(read('app/components/ui/FieldRow.vue')).toMatch(/px-4/)
  })

  it('states the ticket ID once, where the eye already reads it', () => {
    // The rail carried a copyable pill in a bordered section of its own, 60px
    // below a breadcrumb already ending in TK-27 — and only the further-away one
    // could be clicked.
    expect(CARD_PAGE).toMatch(/#item-label/)
    expect(CARD_PAGE.match(/<TicketIdCopy/g) || []).toHaveLength(1)
  })

  it('keeps the delete row on the row grid, quiet until reached', () => {
    // A UButton's own padding puts its glyph 6px inside the column of icons above
    // it, hence a plain button matching UiFieldRow's geometry. Grey at rest so the
    // one destructive control is not red for the whole time you read the card.
    expect(CARD_PAGE).toMatch(/px-4 py-2\.5 min-h-\[42px\][^"]*text-muted hover:text-error/)
    expect(CARD_PAGE).toMatch(/group-hover:text-error/)
  })

  it('orders the columns at every width, not just where they become columns', () => {
    // `lg:order-2` alone left the DOM order standing below that breakpoint, so a
    // phone got the properties and a Delete button above the card's title.
    // Scoped to class attributes: the template comment explaining this names
    // `lg:order-2` in prose, and matching that would pass for the wrong reason.
    const classes = [...CARD_PAGE.matchAll(/class="([^"]*)"/g)].map(m => m[1]!).join(' ')

    expect(classes).not.toMatch(/lg:order-/)
    expect(classes).toMatch(/\border-1\b/)
    expect(classes).toMatch(/\border-2\b/)
  })
})

/**
 * A comment thread is a stack of records, and it was rendered as neither a stack
 * nor records: `space-y-4` put 16px between comments and 2px between a name and
 * its own body, so four comments read as eight loose lines with nothing marking
 * where one ended.
 */
describe('the comment thread', () => {
  const COMMENTS = read('app/components/CommentList.vue')

  it('draws no lines at all — the avatars are the structure', () => {
    // Two wrong answers came first. **Horizontal hairlines between comments:** this
    // app uses a divided stack for a *table of uniform fields* — the rail, the
    // attachments list — and banding prose reads as a spreadsheet; worse, a
    // full-width rule cuts across the avatar gutter and slices the column the
    // avatars are supposed to own. **Then a vertical connector down that gutter:**
    // its length is whatever the comment above happens to be tall, so between two
    // one-liners it is a 20px tick and below a code block a 115px rail — a fragment
    // rather than structure. A connector earns its keep when the nodes it joins are
    // cards (GitHub) or uniform rows (an activity log).
    const classes = [...COMMENTS.matchAll(/class="([^"]*)"/g)].map(m => m[1]!).join(' ')

    expect(classes).not.toMatch(/divide-y/)
    expect(classes).not.toMatch(/border-y/)
    expect(classes).not.toMatch(/border-l border-accented/)
    // Whitespace does the separating: 24px between comments against roughly 7px
    // between a byline and its own body.
    expect(classes).toMatch(/space-y-6/)
  })

  it('keeps the byline subordinate to the body it introduces', () => {
    // 13px semibold over 14px prose is barely a step, which is why a name and the
    // sentence under it were indistinguishable and four comments read as eight
    // loose lines. That — not the gap ratio — was the original defect.
    expect(COMMENTS).toMatch(/text-xs font-semibold text-default truncate/)
    expect(COMMENTS).not.toMatch(/text-sm font-medium text-default truncate/)
  })

  it('takes the row actions out of the byline’s flow', () => {
    // In the flex row these 20px buttons set the byline's height, so it was 20px
    // tall whether or not anything was in it and the body sat 24px under its own
    // author's name — the coupling the design depends on, undone by a control that
    // only appears on hover.
    expect(COMMENTS).toMatch(/absolute right-0 top-0 flex items-center gap-0\.5 transition-opacity/)
  })

  it('keeps every relative time honest about the moment behind it', () => {
    // Author grouping — Slack's answer to a repeated name — was rejected because
    // the demo card's three consecutive comments are 23 minutes and 3½ hours
    // apart, so no honest window fires. That is only defensible if the real times
    // are reachable, so each one carries an absolute timestamp.
    expect(COMMENTS).toMatch(/<UTooltip :text="formatTimestamp\(comment\.createdAt\)"/)
    expect(COMMENTS).toMatch(/Edited \$\{formatTimestamp\(comment\.updatedAt\)\}/)
  })

  it('shares one absolute-date formatter', () => {
    // It was a local `formatDate` on the card page, which is where the second
    // caller would have copied it from.
    expect(read('app/utils/formatting.ts')).toMatch(/export function formatTimestamp/)
    expect(CARD_PAGE).not.toMatch(/function formatDate/)
    expect(CARD_PAGE).toMatch(/formatTimestamp\(card\.createdAt\)/)
  })
})

/**
 * `UiSectionLabel`'s `rule` variant drew `h-px bg-border`, and there is no
 * `--color-border` token in this app — so the hairline resolved to nothing and had
 * never once been visible. It went unnoticed because `rule` has zero call sites,
 * which is the trap `useTextDraft` fell into and the reason CLAUDE.md counts them.
 */
describe('hairlines are borders', () => {
  it('leaves no bg-border in a class attribute', () => {
    // Scoped to classes: both files now *name* the broken utility in prose
    // explaining why it went, and matching that would pass for the wrong reason.
    for (const path of ['app/components/ui/SectionLabel.vue', 'app/components/CommentList.vue']) {
      const classes = [...read(path).matchAll(/class="([^"]*)"/g)].map(m => m[1]!).join(' ')
      expect(classes, path).not.toMatch(/bg-border\b/)
    }
  })
})
