import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const CARD_MODAL = read('app/components/CardModal.vue')
const CARD_PAGE = read('app/pages/projects/[slug]/cards/[cardId].vue')
/**
 * The description block used to be duplicated into both surfaces above, which is
 * why several assertions here ran `it.each` over the pair. It is one component
 * now, so those became single assertions — and the ones that compared the two
 * copies to each other had nothing left to compare and are gone. That is the
 * intended end state for a guard whose whole job was to police a copy: when the
 * copy goes, so does it.
 */
const DESCRIPTION = read('app/components/CardDescriptionSection.vue')
const MAIN_CSS = read('app/assets/css/main.css')

/**
 * The trap this file has fallen into four times: every rule here is explained in
 * prose *in the file it guards*, so a `not.toMatch` for the utility that went
 * matches the sentence saying it went, and the test passes for exactly the wrong
 * reason. Negative assertions therefore run on stripped source, or on the class
 * attributes extracted from it, never on the raw text.
 */
const strip = (src: string) => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

const tokens = (classAttr: string) => classAttr.split(/\s+/).filter(Boolean)

/**
 * The class list of the element `needle` sits inside: from the nearest opening
 * `tag` before it, whose own `class` is the first one in that slice. Elements are
 * located by what they *do* — the handler they bind, the text they render — rather
 * than by the classes they carry, which is what several of the assertions below
 * used to pin.
 */
const classesAt = (src: string, needle: string, tag = '<div') => {
  const at = src.indexOf(needle)
  return at < 0 ? [] : tokens(src.slice(src.lastIndexOf(tag, at), at).match(/class="([^"]*)"/)?.[1] ?? '')
}

/**
 * The app's closed type ramp, smallest first — the six steps main.css declares.
 * It redefines 2xs/sm/base/lg and deliberately leaves `xs` on Tailwind's 12px
 * ("so component internals that rely on it are untouched"); `xl` is likewise
 * Tailwind's.
 */
const TYPE_SCALE = ['2xs', 'xs', 'sm', 'base', 'lg', 'xl']
const TAILWIND_PX: Record<string, number> = { xs: 12, xl: 20 }
const stepPx = (step: string) =>
  Number(MAIN_CSS.match(new RegExp(`--text-${step}: ([\\d.]+)rem`))?.[1]) * 16 || TAILWIND_PX[step]!

/** The ramp step a class list sets, if it sets one. */
const textStep = (list: string[]) =>
  list.map(t => TYPE_SCALE.find(s => t === `text-${s}`)).find(Boolean)

/**
 * The ramp step a CSS rule's `font-size` lands on, named or measured. Matched on
 * the declaration rather than on the first px value in the block, which is a
 * `border-radius` as often as not.
 */
const fontSizeStep = (decl: string) =>
  decl.match(/font-size:\s*var\(--text-([\w]+)\)/)?.[1]
  ?? TYPE_SCALE.find(s => stepPx(s) === Number(decl.match(/font-size:\s*([\d.]+)px/)?.[1]))

/** One CSS rule's body, anchored: `[^{}]` cannot run past the closing brace. */
const cssBlock = (src: string, selector: string) =>
  src.match(new RegExp(`${selector}\\s*\\{([^{}]*)\\}`))?.[1] ?? ''

/**
 * The call that begins at `at`, up to the parenthesis that closes it — so what a
 * call contains can be asserted without pinning the order it contains it in.
 */
const callArgs = (src: string, at: number) => {
  let depth = 0
  for (let i = src.indexOf('(', at); i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && !--depth) return src.slice(at, i + 1)
  }
  return ''
}

/**
 * The `>` that closes the opening tag beginning at `at`, quoted attribute values
 * skipped — so a component *inside* the element cannot be mistaken for the end of
 * its opening tag, which is how the previous slice of the slideover's default slot
 * came out empty when something was put in it.
 */
const tagEnd = (src: string, at: number) => {
  let quote = ''
  for (let i = at; i < src.length; i++) {
    const c = src[i]!
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === '\'' || c === '`') {
      quote = c
    } else if (c === '>') {
      return i
    }
  }
  return -1
}

/**
 * The description in read mode, on either card surface: down to the placeholder
 * button that replaces it when there is no prose, whose own `hover:bg-muted` is
 * the correct answer for a button and not part of this region.
 */
const proseRegion = (src: string) => {
  const clean = strip(src)
  return clean.slice(
    clean.indexOf('v-else-if="description"'),
    clean.lastIndexOf('<button', clean.indexOf('Add a description…'))
  )
}

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

  it('the description editor owns the only Save, and it carries the shortcut', () => {
    // Counted as rendered text nodes, comments stripped. The previous version
    // required `<UiKey value="meta"` to follow the label immediately, so it could
    // not see `<UButton>Save</UButton>` — the most natural spelling, and exactly
    // what the footer button it exists to keep out was.
    const source = strip(DESCRIPTION)
    const template = source.slice(source.indexOf('<template>'))
    const saves = [...template.matchAll(/>\s*Save\s*</g)]

    expect(saves).toHaveLength(1)
    // Its label is followed immediately by the ⌘↵ keys, which is what
    // distinguishes it from a bar button.
    expect(template.slice(saves[0]!.index)).toMatch(/^>\s*Save\s*<UiKey value="meta"[^>]*\/>\s*<UiKey value="enter"/)
  })

  it.each(surfaces)('%s has no save of its own', (_name, src) => {
    // The point of the assertion above, from the other side: neither surface may
    // grow a second Save now that the description's lives elsewhere.
    const source = strip(src)
    const template = source.slice(source.indexOf('<template>'))

    expect([...template.matchAll(/>\s*Save\s*</g)]).toHaveLength(0)
    expect(source).not.toMatch(/label="Save"/)
    expect(source).not.toMatch(/'Save'/)
  })

  it('guards the description save on the description changing', () => {
    // The dirty comparison stays with each surface — they compare against
    // different things — but only a dirty description may be saved.
    expect(DESCRIPTION).toMatch(/:disabled="!dirty"/)
    for (const src of [CARD_MODAL, CARD_PAGE]) {
      expect(src).toMatch(/descriptionDirty/)
      expect(src).toMatch(/:dirty="descriptionDirty"/)
    }
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
  it('offers the description instead of leaving a void', () => {
    expect(DESCRIPTION).toContain('Add a description…')
  })

  it('offers Copy and Edit only where there is prose', () => {
    // Two invitations to write the same paragraph is one too many, so the pair
    // belongs to the branch that renders a description, never to the empty one —
    // there the placeholder row is itself the button.
    const readMode = DESCRIPTION.slice(DESCRIPTION.indexOf('v-else-if="description"'))
    const empty = DESCRIPTION.indexOf('Add a description…')

    expect(readMode).toContain('aria-label="Edit the description"')
    expect(readMode).toContain('aria-label="Copy the description as Markdown"')
    expect(DESCRIPTION.indexOf('aria-label="Edit the description"')).toBeLessThan(empty)
    expect(DESCRIPTION).not.toMatch(/'Edit' : 'Add'/)
  })

  it('makes the empty description one row rather than a heading', () => {
    // An empty section is one row — icon, verb, border — and no heading above it.
    expect(DESCRIPTION).toContain('i-lucide-text')
    expect(classesAt(DESCRIPTION, 'Add a description…', '<button')).not.toEqual([])
  })

  it('spells that row and the collapsed comment composer identically', () => {
    // They are the same object, so the assertion is that they carry the same
    // classes. This used to compare *three* copies, two of which were the same
    // markup pasted into both card surfaces — an agreement the guard could only
    // ever police, never enforce. Those two are one component now, so what is
    // left is the comparison that still has teeth: the description row against
    // the comment composer, which is a genuinely different component that has to
    // match it. Sorted token sets, because the values are not the point.
    const rows = [
      classesAt(DESCRIPTION, 'Add a description…', '<button'),
      classesAt(read('app/components/CommentList.vue'), '@click="openComposer"', '<button')
    ].map(list => [...list].sort())

    expect(rows[0]!.length).toBeGreaterThan(0)
    expect(rows[1]).toEqual(rows[0])
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
    // Anchored on the rule: `[^{}]` cannot leave it, where the `[\s\S]*?` this
    // replaces let both properties be declared anywhere at all after the
    // selector — including in the next block.
    const block = cssBlock(MAIN_CSS, '\\.panel-scroll')

    expect(block).toMatch(/--panel-fade-top\b/)
    expect(block).toMatch(/--panel-fade-bottom\b/)
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
  it('keeps the slideover’s default slot free of components', () => {
    // Scoped to that slot — from the opening tag's `>` to the first named one —
    // rather than to everything above `</USlideover>`, which took in the script
    // block and `#header`, `#body` and `#footer` with it. A dialog inside a named
    // slot portals correctly and is legal; one in the default slot is the bug.
    const open = CARD_MODAL.indexOf('<USlideover')
    const firstSlot = CARD_MODAL.indexOf('<template #', open)

    expect(open).toBeGreaterThan(-1)
    expect(firstSlot).toBeGreaterThan(open)
    expect(CARD_MODAL.slice(tagEnd(CARD_MODAL, open) + 1, firstSlot)).not.toMatch(/<[A-Z]/)
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
    // The fill is checked on the read-mode region's own class attributes: the
    // version that named `hover:bg-muted/60` forbade one opacity step and passed
    // on `/50`, and the placeholder button below this region carries a
    // `hover:bg-muted` that is the correct answer for a button.
    for (const [name, src] of [['CardModal', CARD_MODAL], ['the card page', CARD_PAGE]] as const) {
      const fills = [...proseRegion(src).matchAll(/class="([^"]*)"/g)]
        .flatMap(m => tokens(m[1]!))
        .filter(t => t.startsWith('hover:bg-'))

      expect(strip(src), name).not.toContain('onProseClick')
      expect(fills, name).toEqual([])
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
    // stops a stray drop leaving the app. Asserted as an ordering rather than as
    // the newline that happened to sit between the two lines.
    const over = drop.slice(drop.indexOf('function onDragOver'), drop.indexOf('function onDragLeave'))

    expect(over).toContain('e.preventDefault()')
    expect(over).toContain('opts.enabled')
    expect(over.indexOf('preventDefault')).toBeLessThan(over.indexOf('opts.enabled'))
  })

  it('does not unset the highlight faster than a drag reports itself', () => {
    // The drag-and-drop model re-runs `dragover` on a fixed cadence, so a
    // stationary pointer over the panel is the slowest legitimate event stream
    // there is and a backstop shorter than that cadence blinks the highlight off
    // between two perfectly normal events. Both numbers are read out of the
    // composable — the cadence from the paragraph that justifies the choice, the
    // backstop from the timer — so neither can move without the other answering
    // for it. Leaving is detected by containment; this is only the backstop.
    const drop = read('app/composables/useFileDrop.ts')
    const cadence = Number(drop.match(/every (\d+)ms/)?.[1])
    const keepDragging = drop.slice(drop.indexOf('function keepDragging'), drop.indexOf('function onDragOver'))
    const backstop = Number(keepDragging.match(/setTimeout\([\s\S]*\},\s*(\d+)\)/)?.[1])

    expect(cadence).toBeGreaterThan(0)
    expect(backstop).toBeGreaterThan(cadence)
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
    // That `decorateCodeBlocks` runs when `rendered` changes, rather than the one
    // expression that currently arranges it: `nextTick` inside the callback and
    // `flush: 'post'` beside it are the same guarantee written differently, and
    // the pinned literal called one of them a regression.
    const at = PROSE.indexOf('watch(rendered')

    expect(at).toBeGreaterThan(-1)
    expect(callArgs(PROSE, at)).toContain('decorateCodeBlocks')
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
  /**
   * `UiFieldRow`'s padding and minimum height, off its root element. This is the
   * grid the rail's rows are cut to, and the delete row below has to match it —
   * one relationship, which used to be two independent literals in two
   * assertions that could drift apart without either failing.
   */
  const FIELD_ROW = read('app/components/ui/FieldRow.vue')
  const ROW_GEOMETRY = tokens(
    FIELD_ROW.slice(FIELD_ROW.indexOf('<template>')).match(/class="([^"]*)"/)?.[1] ?? ''
  ).filter(t => /^(px|py|min-h)-/.test(t))

  it('lets the host own the border, so every row shares one inset', () => {
    // CardProperties' rows layout draws the hairlines and nothing else. There is
    // no UiFieldGroup any more: one consumer, and its only host already had a
    // border.
    const props = read('app/components/CardProperties.vue')

    expect(props).toMatch(/'divide-y divide-default'/)
    expect(props).not.toContain('UiFieldGroup')
    expect(existsSync(join(ROOT, 'app/components/ui/FieldGroup.vue'))).toBe(false)
    // One inset for the rail's rows, matching the sections around them.
    expect(ROW_GEOMETRY).not.toEqual([])
    expect(ROW_GEOMETRY.some(t => t.startsWith('px-'))).toBe(true)
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
    // it, hence a plain button cut to `UiFieldRow`'s geometry — read off FieldRow
    // above rather than restated here. Grey at rest so the one destructive control
    // is not red for the whole time you read the card.
    const deleteRow = classesAt(CARD_PAGE, '@click="showDeleteConfirm = true"', '<button')

    expect(ROW_GEOMETRY).not.toEqual([])
    for (const token of ROW_GEOMETRY) expect(deleteRow, token).toContain(token)
    expect(deleteRow).toContain('text-muted')
    expect(deleteRow).toContain('hover:text-error')
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
 * A comment thread is a stack of records, and for two attempts it was rendered as
 * neither a stack nor records.

 * First `space-y-4` and nothing else, where the diagnosis was that a 13px semibold
 * name and the 14px sentence under it *looked alike*. Then "the avatars are the
 * structure" — no rules, no boxes, no connector — which does not survive being read
 * on a real card: nine comments put nine 24px discs across ~500px of text, so the
 * column is 95% empty and the eye gets one ragged block of text with occasional
 * bold lines in it. Tinting the discs fixed identity and did nothing for
 * separation.
 *
 * What settles it is not taste: a comment can contain a **code block**, a slab with
 * its own border, surface and radius. With no boundary on the comment, the most
 * sharply defined thing on the thread was the inside of a comment rather than the
 * comment — a hierarchy that inverts is one the reader has to fight. Hence a rule
 * with a job *and a ceiling*: present, and weaker than the code block's border.
 */
describe('the comment thread', () => {
  const COMMENTS = read('app/components/CommentList.vue')

  /**
   * The byline row, located from the name it renders rather than from the classes
   * it carries. It ends where the comment's own body begins, so the row actions
   * positioned inside it belong to this slice and the prose below it does not.
   */
  const CLEAN = strip(COMMENTS)
  const BYLINE = CLEAN.slice(
    CLEAN.lastIndexOf('<div', CLEAN.indexOf('comment.authorName ??')),
    CLEAN.indexOf('v-if="editingId === comment.id"')
  )

  it('separates records with a rule that is inset past the avatar gutter', () => {
    // The distinction that makes this different from the full-width hairlines
    // rejected earlier: the rule lives on the *content column*, whose left edge is
    // where the prose starts, so it defines that column instead of slicing it. A
    // `divide-y` on the list — or any border on the `<li>` — spans the gutter too
    // and takes the faces' column away from them, which is what was wrong before.
    expect(COMMENTS).toMatch(/min-w-0 flex-1[^"]*border-t border-default/)
    expect(COMMENTS).toMatch(/group-first:border-t-0/)

    const listClasses = COMMENTS.match(/<ul\b[\s\S]{0,80}?class="([^"]*)"/)?.[1] ?? ''
    const rowClasses = COMMENTS.match(/:key="comment\.id"\s*\n\s*class="([^"]*)"/)?.[1] ?? ''

    expect(listClasses).not.toMatch(/divide-y/)
    expect(rowClasses).not.toMatch(/border/)
  })

  it('centres the rule in its band rather than hugging one comment', () => {
    // The gap above the rule is the list's `space-y-*` and the gap below it is the
    // content column's `pt-*`. Equal, or the hairline reads as belonging to the
    // comment it is nearer to instead of as the join between two.
    const between = COMMENTS.match(/<ul\b[\s\S]{0,80}?class="space-y-(\d+)"/)?.[1]
    const below = COMMENTS.match(/border-t border-default pt-(\d+)/)?.[1]

    expect(between).toBeDefined()
    expect(below).toBe(between)
  })

  it('puts no hover background on a row that is not clickable', () => {
    // It was `hover:bg-muted/50` — over white, `oklab(0.985 0 0 / 0.5)`, a 0.75%
    // lightness delta that nobody could see in light mode. The contrast is the
    // lesser problem: nothing in a comment row is clickable, and a surface that
    // lights up under the pointer and then does nothing is worse than one that
    // never suggested it could. Its real job — tying the far-right action buttons
    // to their comment — belongs to the rule, which bounds the record all the way
    // to the edge those buttons sit on.
    //
    // Scoped to the `<li>`'s own class attribute. Nothing in a comment *row* is
    // clickable — but the Edit and Delete buttons inside it are, and a hover fill
    // on a button is this app's idiom, which the composer 120 lines below uses.
    // The previous version banned every hover background anywhere in the thread on
    // the strength of one invisible fill on the row, so it forbade the correct
    // answer for a button along with the wrong one for a row.
    const row = tokens(COMMENTS.match(/:key="comment\.id"\s*\n\s*class="([^"]*)"/)?.[1] ?? '')

    expect(row).not.toEqual([])
    expect(row.filter(t => t.startsWith('hover:bg-'))).toEqual([])
    // The `group` stays: the buttons still need a hover target, just not a fill.
    expect(row).toContain('group')
    expect(BYLINE).toMatch(/group-hover:opacity-100/)
  })

  it('gives the column enough colour to be the structure', () => {
    expect(COMMENTS).toContain('<UiAvatar')
    expect(COMMENTS).not.toContain('<UAvatar')
    // A deleted author leaves an empty identity slot, and absent data should look
    // absent — a confident colour on a name nobody owns reads as a person.
    expect(COMMENTS).toMatch(/:tint="!!comment\.authorName"/)
  })

  it('sets the composer apart by more space than separates two comments', () => {
    // Against the *whole* interval, `space-y` + `pt`, not just the list gap. This
    // has now collided twice for the same reason at two different numbers: 24
    // against 24 before the separators, then 32 against 32 the moment they arrived,
    // because adding `pt-4` moved the interval the composer had to beat and nothing
    // recomputed it. A one-sided assertion would have passed both times.
    const listGap = Number(COMMENTS.match(/<ul\b[\s\S]{0,80}?class="space-y-(\d+)"/)?.[1])
    const belowRule = Number(COMMENTS.match(/border-t border-default pt-(\d+)/)?.[1])
    const beforeComposer = Number(COMMENTS.match(/comments\.length \? 'mt-(\d+)'/)?.[1])

    expect(listGap).toBeGreaterThan(0)
    expect(beforeComposer).toBeGreaterThan(listGap + belowRule)
  })

  it('keeps the byline subordinate to the body it introduces', () => {
    // 13px semibold over 14px prose is barely a step, which is why a name and the
    // sentence under it were indistinguishable and four comments read as eight
    // loose lines. That — not the gap ratio — was the original defect, so the
    // assertion is the relationship rather than the classes that currently express
    // it: the byline sits lower on the app's ramp than the prose it introduces,
    // and by more than the 1px that was the rejected design.
    const bodyStep = fontSizeStep(cssBlock(read('app/components/ProseDescription.vue'), '\\.prose-description'))
    const nameStep = textStep(classesAt(BYLINE, 'comment.authorName ??', '<span'))

    expect(TYPE_SCALE).toContain(nameStep)
    expect(TYPE_SCALE).toContain(bodyStep)
    expect(TYPE_SCALE.indexOf(nameStep!)).toBeLessThan(TYPE_SCALE.indexOf(bodyStep!))
    expect(stepPx(bodyStep!) - stepPx(nameStep!)).toBeGreaterThanOrEqual(2)
  })

  it('puts the name and the time on one step, so the byline is one line', () => {
    // They were 12px and 10px, which put two baselines inside one 16px line and
    // made the byline read as a fragment rather than as a line. One size, two
    // weights is what UiSectionLabel and the rail's rows already do.
    //
    // That measurement is the whole finding, and the previous version generalised
    // it into a ban on `text-2xs` across all of CommentList — a declared 10px step
    // that a badge or a key hint elsewhere in the file is entitled to. Scoped to
    // the byline, and stated as the equality that was actually broken.
    const nameStep = textStep(classesAt(BYLINE, 'comment.authorName ??', '<span'))
    const timeStep = textStep(classesAt(BYLINE, 'relativeTime(comment.createdAt)', '<span'))

    expect(TYPE_SCALE).toContain(nameStep)
    expect(timeStep).toBe(nameStep)
  })

  it('anchors the row actions to the byline, out of its flow', () => {
    // Out of flow because in the byline's flex row these 20px buttons set its
    // height, so it was 20px tall whether or not anything was in it and the body
    // sat 24px under its own author's name — the coupling the design depends on,
    // undone by a control that only appears on hover. Out of flow is what buys the
    // byline its natural height back, so that is what is asserted: `absolute` on
    // the actions and no explicit `h-*` on the byline. Which edge they are pinned
    // to, and the gap between them, are free.
    //
    // Anchored to the *byline* and not the `<li>` — hence `relative` here — because
    // the li's top edge is where the separator now is: measured from there the
    // buttons floated in the 16px band above the rule, straddling it and belonging
    // to neither record.
    const actions = tokens(BYLINE.match(/v-if="canDelete\(comment\)[^>]*?class="([^"]*)"/)?.[1] ?? '')
    const byline = tokens(BYLINE.match(/^<div[^>]*class="([^"]*)"/)?.[1] ?? '')

    expect(actions).toContain('absolute')
    expect(byline).toContain('relative')
    expect(byline.filter(t => /^h-/.test(t))).toEqual([])
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

  it('does not let inline decorations invent their own type sizes', () => {
    // Measured across one thread there were **seven** type sizes, five of them
    // inside a 2.4px range: 11.57px (code in a block), 11.9px (inline code), 12px
    // (the byline), 12.6px (a mention) and 14px (the prose). No two of those
    // differences read as hierarchy — they read as a page that cannot settle, which
    // is what a reader reports as "restless" without being able to name a cause.
    //
    // A mention is therefore exactly the size of the sentence it sits in; the pill,
    // the weight and the brand colour already say "this is a person". Inline code
    // keeps a step down because mono runs large at the same size, but it takes the
    // one that lands on 12px at body size — the app's scale, and the byline's step.
    const prose = read('app/components/ProseDescription.vue')
    const rule = (selector: string) => cssBlock(prose, `:deep\\(${selector}\\)`)
    const bodyPx = stepPx(fontSizeStep(cssBlock(prose, '\\.prose-description'))!)
    const inlineCodeEm = Number(rule('code:not\\(pre code\\)').match(/font-size: ([\d.]+)em/)?.[1])

    expect(rule('\\.mention')).toMatch(/font-size: inherit/)
    // The measurement, not the multiplier: whatever `em` value inline code takes,
    // the pixel size it computes to at body size has to *be* a declared step.
    // 0.857em × 14px is 11.998px, which is the 12px step; 0.9em is 12.6px, which is
    // on no step at all and is one of the half-pixel nudges the ramp exists to
    // remove — hence a tenth of a pixel of slack and no more.
    const inlineCodePx = inlineCodeEm * bodyPx

    expect(inlineCodeEm).toBeGreaterThan(0)
    expect(
      TYPE_SCALE.map(stepPx).find(px => Math.abs(px - inlineCodePx) < 0.1),
      `${inlineCodePx}px is on no declared step`
    ).toBeDefined()
    // `pre` declared 13.5px and rendered 11.57px: typography's own `code` rule sets
    // 0.857em and wins inside the block, so without this reset the declaration on
    // `pre` is decoration and every code block in the app draws a size nobody chose.
    expect(rule('pre code')).toMatch(/font-size: inherit/)
    // 13px *is* `--text-sm`, so the token spelling is the one this should be — see
    // design-tokens.test.ts, which exists to eliminate arbitrary px sizes. Accepted
    // either way, resolved to the step, so migrating the declaration is not a test
    // change.
    expect(fontSizeStep(rule('pre'))).toBe('sm')
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
