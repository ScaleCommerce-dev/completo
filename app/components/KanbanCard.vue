<script setup lang="ts">
import type { Component } from 'vue'
import type { BoardCard, Member } from '~/types/card'
import type { CardField } from '#shared/utils/card-fields'
/**
 * Named imports, not the usual auto-import: Nuxt resolves `<TagMenu>` to an
 * import at compile time by reading the *template*, so a `<component :is>` given
 * the string `'TagMenu'` resolves against nothing and renders a literal
 * `<tagmenu>` element — silently, with the card looking almost right. `wrap()`
 * hands `:is` the component itself instead. See `armed`.
 */
import { AssigneeMenu, DueDatePicker, PriorityMenu, TagMenu, UTooltip, UiPassthrough } from '#components'

/**
 * A card on the board.
 *
 * The card is a scanning object, not a detail view: a column of twenty is meant
 * to read as a list of *titles*. It previously read as a list of identifiers.
 * `TK-27` sat on line one in tracked monospace beside filled uppercase tag
 * pills, the title came second, and a stripped-markdown description came third —
 * so a card carrying a spec (TK-32) rendered as a paragraph and the first thing
 * the eye hit on every card was a number nobody was looking for.
 *
 * Now, top to bottom:
 *
 *  - **Title.** Loudest thing on the card, full width, up to two lines.
 *  - **Description,** two lines of stripped markdown, when the board asks for
 *    it. See below.
 *  - **Tags,** as many as fit on one line plus a count of what didn't, each an
 *    outlined pill rather than a filled one. See TagPill's `quiet` variant.
 *  - **A footer of two zones.** Facts on the left — the ticket ID, comment and
 *    attachment counts — and the card's four fields on the right.
 *
 * The card carries three kinds of thing and they used to be mixed: facts, fields
 * (a value when set, a control when not) and actions on the card *as an object*.
 * Both zones held one of the latter — the copy buttons hung off the ID on the
 * left, the full-page link sat among the fields on the right — so "where are the
 * actions" had two answers and neither zone read as one idea. The link moved to
 * the identity line at the top, the copy buttons are gone from this surface
 * (clicking the ID still copies its link), and what is left is a clean split:
 * left tells you about the card, right changes it.
 *
 * All four field controls are hover-only ink: the control is always there, the
 * mark appears when you reach for it. Due date is the single exception and shows
 * its date once it has one, because nothing else on the card carries it. Tags
 * and due date used to render *only* when set, so a card with neither offered no
 * way to acquire one short of opening it; priority used to render always, in its
 * own colour, duplicating the edge bar an inch away.
 *
 * **Every one of these is per-board** — see `shared/utils/card-fields.ts` for
 * the registry and `shows(...)` below for how the card reads it. The description
 * is the one that needed it first: removing the excerpt from the card face
 * outright fixed the wall-of-paragraphs problem and lost the at-a-glance context
 * with it, and whether an excerpt helps depends entirely on how that team writes
 * descriptions. Two lines, `text-xs` and `text-muted`, so it reads as
 * subordinate to the title rather than competing with it the way the
 * pre-overhaul card did.
 *
 * There is no longer a glyph marking a card that *has* a description when the
 * excerpt is switched off. It existed for exactly that case, and it made "off"
 * mean "smaller" rather than off — the one thing a switch on this list must not
 * do.
 *
 * The title is clamped at two rather than one. A line holds about 38 characters
 * at this width, so one line truncates roughly a card in ten on a board of short
 * titles and nearly all of them once a team prefixes with "[Bug]" or a component
 * name. Two lines cost a line only on the cards that need it; one line costs
 * information on those same cards, silently.
 */
const props = defineProps<{
  card: BoardCard
}>()

const kanbanContext = inject<{
  projectKey: ComputedRef<string | undefined>
  projectSlug: ComputedRef<string | undefined>
  members: ComputedRef<Member[] | undefined>
  tags: ComputedRef<Array<{ id: string, name: string, color: string }> | undefined>
  cardFieldVisible: ComputedRef<(key: CardField) => boolean>
  lightFamily: (familyId: number | null) => void
}>('kanbanContext')!

/** `shows('tags')` — see `shared/utils/card-fields.ts`. */
const shows = (key: CardField) => kanbanContext.cardFieldVisible.value(key)

/**
 * Stripped, because the raw source puts `## Kontext` and `- [ ]` on the card
 * face. `stripMarkdown` is the same helper `ListCellDescription` uses, so the
 * two views excerpt a description identically.
 */
const descriptionExcerpt = computed(() => {
  if (!shows('description') || !props.card.description) return ''
  return stripMarkdown(props.card.description)
})

const emit = defineEmits<{
  'click': []
  /** The parent chip was clicked: open that card instead of this one. */
  'open-card': [cardId: number]
  'update': [cardId: number, updates: Record<string, unknown>]
  /** Separate from `update`: tags are a different endpoint, not a card column. */
  'update-tags': [cardId: number, tagIds: string[]]
}>()

const detailUrl = computed(() => {
  if (!kanbanContext.projectSlug.value) return null
  return `/projects/${kanbanContext.projectSlug.value}/cards/${formatTicketId(kanbanContext.projectKey.value, props.card.id)}`
})

const showTags = computed(() => shows('tags') && !!props.card.tags?.length)
const allTagNames = computed(() => (props.card.tags || []).map(t => t.name).join(', '))

/**
 * Tags fill the line, and `+N` counts what didn't fit — see `useTagOverflow`,
 * which the card panel's properties row now shares so the two surfaces describe
 * tags identically.
 *
 * `badgeLeft` is the part only this surface needs: the row is full-width here, so
 * a count in flow would wrap onto the clipped line and vanish exactly when it was
 * needed.
 */
const tagRow = useTemplateRef<HTMLElement>('tagRow')
const { hiddenCount: hiddenTagCount, badgeLeft } = useTagOverflow({
  row: () => tagRow.value,
  tags: () => props.card.tags
})

/**
 * What the card holds beyond its own fields: a discussion, and files.
 *
 * The comment count is the one worth having of the two — an attachment is
 * usually a screenshot pasted once, while three comments mean the card is being
 * argued about, which is what you scan a board to find. Only the attachment
 * count was here, so the more useful signal was the missing one.
 *
 * A list rather than two hand-written spans, because they differ in three
 * values and nothing else; written out twice they drift, which is how the label
 * came to read "1 attachments".
 */
const contentMarks = computed(() => [
  { key: 'commentCount' as const, icon: 'i-lucide-message-square', count: props.card.commentCount || 0, noun: 'comment' },
  { key: 'attachmentCount' as const, icon: 'i-lucide-paperclip', count: props.card.attachmentCount || 0, noun: 'attachment' }
].filter(m => m.count > 0 && shows(m.key)).map(m => ({
  ...m,
  label: `${m.count} ${m.noun}${m.count === 1 ? '' : 's'}`
})))

/**
 * Where the card sits in a parent/sub-task pair, in one footer slot.
 *
 * A parent shows its sub-tasks as "done/total"; a sub-task shows its parent's
 * ticket. One level means a card is never both, so the two share a slot, and
 * the same place on every card answers "is this part of something".
 *
 * The sub-task side is the parent's *ticket*, not its title. It used to be the
 * title, on its own line above the card's, and that line cost three things: a
 * second ticket ID at the top of the card where its own usually sits, titles
 * starting at different heights down a column, and a column of siblings opening
 * with the same grey sentence on every card. A ticket has a fixed width, so it
 * never truncates and adds no height. The title is one step away, in the
 * tooltip, and the family itself is one hover away (`kanbanContext.lightFamily`).
 * The tooltip says "Sub-task of: <title>" without the ticket, which the chip
 * itself already shows.
 *
 * In the right-packed strip, never beside the card's own ID: next to it,
 * "TK-6 ↰ TK-5" reads as a range.
 */
const relation = computed(() => {
  if (!shows('subtasks')) return null
  const parent = props.card.parent
  if (parent) {
    const ticket = formatTicketId(kanbanContext.projectKey.value, parent.id)
    return {
      kind: 'parent' as const,
      family: parent.id,
      icon: 'i-lucide-corner-left-up',
      text: ticket,
      complete: false,
      label: `Sub-task of: ${parent.title}`
    }
  }
  const p = props.card.subtasks
  if (!p?.total) return null
  return {
    kind: 'progress' as const,
    family: props.card.id,
    icon: 'i-lucide-list-tree',
    text: `${p.done}/${p.total}`,
    // Success-coloured once every sub-task is done, since "all done" is data.
    complete: p.done === p.total,
    label: `${p.done} of ${p.total} sub-task${p.total === 1 ? '' : 's'} done`
  }
})

/**
 * Lights this card's family across the board while the chip is pointed at or
 * focused. Put out on the way out too: a chip that unmounts under the pointer
 * (a drag, a filter) never gets its `pointerleave`.
 */
let lit = false
function light(on: boolean) {
  if (!on && !lit) return
  lit = on
  kanbanContext.lightFamily(on && relation.value ? relation.value.family : null)
}
onBeforeUnmount(() => light(false))

function openParent(e: Event) {
  if (relation.value?.kind !== 'parent') return
  e.stopPropagation()
  light(false)
  emit('open-card', relation.value.family)
}

const dueStatus = computed(() => getDueDateStatus(props.card.dueDate))

/**
 * Whether the slot paints its value or stays a bare control.
 *
 * A hidden field behaves exactly as an empty one: neutral glyph, revealed on
 * hover, and the tooltip still names the current value. That is what makes these
 * switches free — the board gets quieter, but nothing on it becomes uneditable,
 * so there is no setting that can strand a card with a due date you cannot
 * change. The assignee's glyph is `user` rather than `user-plus` when there *is*
 * someone assigned, since "add" would be a lie.
 */
const paintDue = computed(() => shows('dueDate') && !!props.card.dueDate)
const paintAssignee = computed(() => shows('assignee') && !!props.card.assignee)

/**
 * Hover-only controls share this, so they appear and disappear as one group.
 *
 * `max-sm:opacity-60` is not decoration: a touch device never fires `:hover`, so without
 * it priority, assign and the full-page link are invisible *and* unreachable on a phone.
 * They sit at 60% there instead — quiet, but present.
 */
const REVEAL = 'opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 focus-visible:opacity-100 transition-opacity'
/** `REVEAL` for the ticket ID, which brings its own transition (TicketIdCopy). */
const ID_REVEAL = 'opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 group-focus-within:opacity-100'

/**
 * Every readout in the footer that has a label: the counts, the parent or
 * progress chip, a set due date. One box for all of them — 24px tall, 4px each
 * side, 4px from icon to text — so the gap between any two neighbours is the
 * same and every label sits on one centre line. They used to differ in all
 * three: the due date had 6px of side padding and a 4px icon gap, the counts
 * none and 2px, the parent chip 4px and 2px, so the row's spacing changed with
 * whichever items a card happened to have. The padding is there for the ones
 * you can click (the hover fill needs room) and kept on the ones you cannot, so
 * the rhythm does not depend on which is which.
 */
const CHIP_BASE = 'flex items-center gap-1 px-1 shrink-0 whitespace-nowrap'
const CHIP = `${CHIP_BASE} h-6`

/**
 * One hover idiom for every control on the card.
 *
 * The assignee button used to be the odd one out with `hover:ring-2
 * ring-primary/30` while its four neighbours filled with `bg-elevated` — two
 * answers to "you can click this" in a row of five buttons a centimetre wide.
 * `bg-elevated` wins because it is the app's documented hover surface; the ring
 * was a local invention. Shape follows the content instead — the avatar's fill
 * is a circle, the icons' are `rounded-md`.
 *
 * Every slot is a 24px box, which is both what makes the row read as one control
 * strip and the minimum a finger can hit — the icon buttons were 16px (a 12px
 * glyph in `p-0.5`) next to a 24px avatar, so the cluster was neither even nor
 * quite reachable.
 *
 * The radius is deliberately *not* in here. `rounded-full` appended after a
 * `rounded-md` in the same class list does not win: they are the same property
 * at the same specificity, so the winner is whichever Tailwind emits later, and
 * the avatar came out with 6px corners. Each slot states its own.
 *
 * A set due date has a label, so it takes `CHIP`'s box instead (`SLOT_DUE`).
 */
const SLOT = 'flex items-center justify-center size-6 shrink-0 hover:bg-elevated transition-colors'
/**
 * A set due date. A plain future date is text like its neighbours; due soon and
 * overdue are a pill tinted in their colour. The fill is a cue that does not
 * depend on hue — a filled date among plain ones reads as "needs attention" in
 * greyscale too — and what you scan a board for is the late cards. The tint
 * replaces the hover fill rather than sitting under it, so hovering deepens it.
 *
 * The pill is 20px tall, centred in the chips' 24px row: the height of the
 * avatar beside it, so the two filled shapes at the edge share a top and a
 * bottom. At the full 24px it read as a block taller than the avatar. Width and
 * padding are `CHIP`'s either way, so a date turning urgent moves nothing.
 */
const DUE_CHIP = {
  'overdue': 'h-5 text-error bg-error/10 hover:bg-error/20',
  'due-soon': 'h-5 text-warning bg-warning/10 hover:bg-warning/20',
  'future': 'h-6 text-muted hover:bg-elevated'
} as const
const SLOT_DUE = `${CHIP_BASE} cursor-pointer transition-colors`

/**
 * An empty field's editor: no width at rest, a slot once the card is pointed at
 * or holds focus. Collapsed rather than `hidden`, so Tab still reaches it.
 *
 * 18px wide around a 10px glyph, the chips' own icon size: 4px each side, the
 * chips' padding exactly. It was 24px around 12px, which made the editors look
 * bigger than the readouts beside them and cost the width that a card with two
 * counts, a parent, a date and an assignee does not have — measured, its row
 * came out 3px over at 20px and fits at 18.
 * A touch screen keeps 24px, which a finger needs and which it can afford: the
 * editors are always out there anyway, for the reason `REVEAL` gives. `h-6` and a width of its own rather than `SLOT`'s `size-6`, which
 * would set the width twice.
 */
const GHOST = 'flex items-center justify-center h-6 shrink-0 overflow-hidden hover:bg-elevated transition-colors'
const COLLAPSE = 'w-0 sm:group-hover:w-4.5 group-focus-within:w-4.5 group-focus-within:opacity-100 max-sm:w-6'

type Control = 'tags' | 'priority' | 'due' | 'assignee'

/**
 * Which field control currently has its popup open.
 *
 * Two bugs share this one piece of state.
 *
 * **The strip vanished on click.** `UDropdownMenu` is modal, so Reka sets
 * `pointer-events: none` on `<body>` while it is open. The card then stops
 * matching `:hover`, `group-hover` stops applying, and every control revealed by
 * `REVEAL` — including the one you just clicked — drops to zero opacity. Only
 * priority and assignee showed it, because only those two are dropdowns; the tag
 * and due-date popovers are non-modal. Rather than making the dropdowns
 * non-modal (which would trade a focus trap for a hover quirk), the strip simply
 * stays revealed for as long as anything on it is open. That also covers the
 * case hover never handled: moving the pointer into the popup, which is portaled
 * to `<body>` and so is never "inside" the card.
 *
 * **The tooltip stuck after Escape.** Reka closes the popup and restores focus
 * to the trigger, and a Reka tooltip opens on focus — correct for a keyboard
 * user, but nothing then blurs, so for a pointer user it hung there until the
 * next click. Disabling the tooltip only while the popup is open is not enough:
 * the focus restore lands *after* the close, so the tooltip re-enables just in
 * time to catch it. It stays suppressed until the pointer or focus actually
 * leaves the trigger — an event, not a timer, so there is no window to guess.
 *
 * The cost is that the tooltip will not reappear while you rest on the control
 * you just used. Which is fine: you have already found out what it does.
 */
const openControl = ref<Control | null>(null)

/**
 * Whether this card's four field controls have their real menus behind them yet.
 *
 * They are the most expensive thing on the board by a wide margin. Each is a
 * Reka overlay root — three `UDropdownMenu` through `FieldMenu`, plus the due
 * date's `UPopover` — and each costs about 2ms to instantiate while rendering no
 * DOM at all until it opens. Measured on a 93-column-spanning board of 93 cards:
 * 757ms of unbroken blocked main thread after the request landed, of which the
 * four controls were 83%. Stripping them took the same board to ~120ms. The
 * tooltips around them were a further 10% and are gated on the same flag; the
 * rest of the card — title, tags, ticket ID, content marks — is the remaining
 * ~15%, and is not worth chasing.
 *
 * Nothing is lost by waiting, because the controls are hover-only ink already
 * (`REVEAL`): a menu you cannot see is a menu you cannot open. So the trigger
 * markup renders against `UiPassthrough` until the pointer or focus reaches the
 * card, and against the real menu after.
 *
 * `pointerenter` fires on touch too, immediately before `pointerdown`, and Vue
 * flushes between the two — so a tap normally finds the real trigger already
 * mounted. `armFor` is the guarantee rather than the normal path: a click that
 * still lands on a stand-in arms the card *and* names the control, which the
 * menu reads as `:open` on the way in. Hence the `armed` guard in it — once the
 * real trigger is there, opening is Reka's job and doing it here too would
 * toggle the menu straight back shut.
 *
 * Deliberately not reset. A card that has been reached for once stays armed:
 * re-entering it is the common case, and tearing four overlay roots down on
 * every `pointerleave` would pay the cost twice to save memory nobody is short
 * of.
 */
const armed = ref(false)

function armFor(control: Control) {
  if (armed.value) return
  armed.value = true
  openControl.value = control
}

/** The real overlay once armed, the stand-in before. See `armed`. */
const wrap = (component: Component) => armed.value ? component : UiPassthrough

// The due date is a popover rather than a FieldMenu, so it needs the same
// focus-return rule wired by hand. See `useMenuFocusReturn`.
const dueOpen = computed(() => openControl.value === 'due')
const { onCloseAutoFocus } = useMenuFocusReturn(dueOpen)
const suppressed = ref<Control | null>(null)

function setOpen(name: Control, open: boolean) {
  if (open) {
    openControl.value = name
    suppressed.value = null
  } else if (openControl.value === name) {
    openControl.value = null
    suppressed.value = name
  }
}

/** Called from the trigger's own `pointerleave`/`blur`. */
function releaseTip(name: Control) {
  if (suppressed.value === name) suppressed.value = null
}

const tipOff = (name: Control) => openControl.value === name || suppressed.value === name

const reveal = computed(() => openControl.value ? 'transition-opacity' : REVEAL)
/** The same for an empty field's editor, which also has to keep its width while its menu is open. */
const ghost = computed(() => openControl.value ? 'w-4.5 max-sm:w-6 transition-opacity' : [REVEAL, COLLAPSE])

/**
 * All four menus open in the same place on every card.
 *
 * They are end-aligned, which keeps a 200px menu over the card rather than
 * spilling into the next column — but end-aligned to the *button* meant four
 * different positions on one card (measured: 78px apart) and a different set
 * again on the next, because the strip is `ml-auto` and the due-date control
 * grows from a 24px icon to a 60px chip once a date is set, shoving its
 * neighbours 36px left. Clicking the same field on two cards put the menu in two
 * places for a reason that has nothing to do with the field.
 *
 * The strip's *right* edge, on the other hand, is the card's content edge — the
 * same on every card by construction. Offsetting each menu by the gap between
 * its button and that edge anchors all of them to it.
 *
 * Measured on the way in (capture, so it lands before Reka opens the menu on
 * `pointerdown`) rather than computed from slot widths, which would have to be
 * kept in step with the markup by hand.
 */
const strip = useTemplateRef<HTMLElement>('strip')
const alignOffset = ref(0)

function anchorToStrip(e: Event) {
  const control = (e.target as HTMLElement | null)?.closest('button')
  if (!control || !strip.value) return
  alignOffset.value = Math.round(control.getBoundingClientRect().right - strip.value.getBoundingClientRect().right)
}

const menuPlacement = computed(() => ({ ...FIELD_MENU_ALIGN_END, alignOffset: alignOffset.value }))

const selectedTagIds = computed(() => (props.card.tags || []).map(t => t.id))

function toggleTag(tagId: string) {
  const next = selectedTagIds.value.includes(tagId)
    ? selectedTagIds.value.filter(id => id !== tagId)
    : [...selectedTagIds.value, tagId]
  emit('update-tags', props.card.id, next)
}
</script>

<template>
  <div
    class="kanban-card lift group relative cursor-pointer overflow-hidden rounded-lg bg-default border border-default shadow-raise hover:border-accent"
    :class="shows('priority') && priorityBarClass(card.priority) ? 'accent-edge' : ''"
    :data-family="card.parentId ?? card.id"
    @click="$emit('click')"
    @pointerenter="armed = true"
    @focusin="armed = true"
  >
    <!-- Priority edge bar. High and urgent only. -->
    <span
      v-if="shows('priority') && priorityBarClass(card.priority)"
      class="absolute left-0 top-0 bottom-0 w-accent-bar"
      :class="[priorityBarClass(card.priority), card.priority === 'urgent' ? 'priority-urgent-pulse' : '']"
      aria-hidden="true"
    />

    <!--
      The only control that acts on the card as an object rather than on one of
      its fields — and the only real anchor, which is what makes ⌘-click open a
      new tab. So it sits with the card's identity instead of in the row of field
      values, where it read as a fifth property.

      The title reserves the space with `pr-6` rather than letting this overlay
      it. Costs about three characters on line one; an overlay landing on content
      is what got the pre-overhaul hover toolbar removed.

      `top-1 right-1`, not `top-2 right-2`: the glyph is 12px centred in a 24px
      hit box, so the box's inset is 6px more than the glyph's. At `2` the mark
      sat 15px from each edge — 5px inboard of the card's own 10px padding, which
      read as floating rather than as being in the corner. At `1` it lands on the
      padding line, and the hit box stays 24px.
    -->
    <!--
      Unread-activity dot. Sits in the same top-right corner the maximize link
      uses and fades out on hover so the two never stack: at rest the corner
      carries the unread signal, on hover it carries the action. `pr-6` on the
      title already reserves this space, so neither overlays the title. Cleared
      the moment the card is opened (`useViewPage.openCardDetail`).
    -->
    <span
      v-if="card.hasUnread"
      class="absolute top-1 right-1 z-[5] flex items-center justify-center size-6 pointer-events-none sm:group-hover:opacity-0 transition-opacity"
      aria-label="Unread comments"
    >
      <span class="size-2 rounded-full bg-primary ring-2 ring-bg" />
    </span>

    <!-- Tooltip gated on `armed` with the field controls, and for the same
         reason: the link is hover-only ink, so nothing can want its tooltip
         before the pointer has reached the card. The link itself is not gated —
         ⌘-click and "copy link address" have to work without a hover. -->
    <component
      :is="wrap(UTooltip)"
      text="Open full page"
    >
      <NuxtLink
        v-if="detailUrl"
        :to="detailUrl"
        class="absolute top-1 right-1 z-10 text-dimmed hover:text-primary"
        :class="[SLOT, reveal, 'rounded-md']"
        :aria-label="`Open ${formatTicketId(kanbanContext.projectKey.value, card.id)} in full`"
        @click.stop
      >
        <UIcon
          name="i-lucide-maximize-2"
          class="text-xs"
        />
      </NuxtLink>
    </component>

    <div class="p-2.5 pl-3">
      <!-- The object. The title is the card's keyboard entry: a button, so Tab
           reaches it and Enter opens the card (its click bubbles to the card's
           own handler). The card itself is a `div` because it holds other
           controls, and a button cannot. Inline, so `line-clamp` still applies. -->
      <p class="text-sm font-semibold leading-snug text-highlighted tracking-name line-clamp-2 pr-6">
        <button
          type="button"
          class="inline text-left"
        >
          {{ card.title }}
        </button>
      </p>

      <p
        v-if="descriptionExcerpt"
        class="text-xs leading-relaxed text-muted mt-1 line-clamp-2"
      >
        {{ descriptionExcerpt }}
      </p>

      <!-- Tags, when there are any and the board asks for them. -->
      <div
        v-if="showTags"
        ref="tagRow"
        class="relative flex flex-wrap items-center gap-1 mt-1.5 max-h-4 overflow-hidden"
        :class="hiddenTagCount ? 'pr-7' : ''"
      >
        <TagPill
          v-for="tag in card.tags"
          :key="tag.id"
          data-tag
          :name="tag.name"
          :color="tag.color"
          variant="quiet"
        />
        <!-- `bg-default` so the badge sits on the card rather than on whatever
             the clip caught behind it. -->
        <div
          v-if="hiddenTagCount"
          class="absolute top-0 h-4 flex items-center pl-1 bg-default"
          :style="{ left: `${badgeLeft}px` }"
        >
          <!-- Deferred with the rest — see `armed`. This one is per *overflowing*
               card rather than per card, so it costs nothing on a board with few
               tags and as much as a field control on a board with many. The
               badge itself is never gated: it is a readout, and a `+3` that
               appeared on hover would read as three tags arriving. -->
          <component
            :is="wrap(UTooltip)"
            :text="allTagNames"
          >
            <span class="text-2xs font-medium text-dimmed">+{{ hiddenTagCount }}</span>
          </component>
        </div>
      </div>

      <!-- Footer. The ticket ID on the left, everything else against the right
           edge — see the strip. -->
      <div class="flex items-center gap-1.5 mt-1.5 min-w-0">
        <!-- Always there to copy. A board that switches the ID off gets it on
             hover only, the same as every other field the board hides: off
             means quieter, never unreachable. It is alone on the left, so it
             appearing moves nothing. -->
        <TicketIdCopy
          class="shrink-0"
          :class="shows('ticketId') ? '' : ID_REVEAL"
          :project-key="kanbanContext.projectKey.value"
          :project-slug="kanbanContext.projectSlug.value"
          :card-id="card.id"
          size="xs"
        />

        <!--
          Everything but the ticket ID, packed against the right edge in one
          fixed order, each item only when it has a value:

            [editors]  counts  parent/progress  due  assignee |edge

          So the assignee, when there is one, is always the corner, and a column
          scans down that edge for who owns what. The further from the edge, the
          less a board is scanned for it. An empty field holds no space: it used
          to keep a 24px slot whether set or not — tags, priority and an empty
          assignee together left up to 72px of nothing beside a lone due date.

          Empty fields' editors appear on hover, *left* of the values (`order-1`),
          so nothing already shown moves when the pointer arrives. The DOM order
          is the four editors' own; `order-*` places them, which keeps one copy
          of each control rather than a painted and a ghost copy.

          The ticket ID stays alone on the left, so a sub-task's parent ticket
          never sits beside the card's own.

          Nothing that is shown at rest gives way. A card with two counts, a
          parent, a date and an assignee just fits with its editors out (see
          `COLLAPSE`); should a row ever overflow — a three-digit count — `justify-end` pushes the overflow out
          at the left, where only hover editors are. (The counts briefly
          dropped instead, by wrapping onto a clipped second line. WebKit
          rounds a wrapping row's width down a fraction of a pixel, so the
          second count wrapped away with room to spare.)

          The tag pill row above stays the tags' readout; this is the editor.
        -->
        <div
          ref="strip"
          class="ml-auto flex items-center justify-end gap-0.5 min-w-0 overflow-hidden"
          @pointerdown.capture="anchorToStrip"
          @keydown.capture="anchorToStrip"
        >
          <span
            v-if="contentMarks.length"
            class="order-2 flex items-center gap-0.5 shrink-0"
          >
            <!-- Tooltips on every chip, so a glyph and a number always have a
                 sentence one hover away. Deferred with the rest — see `armed`. -->
            <component
              :is="wrap(UTooltip)"
              v-for="mark in contentMarks"
              :key="mark.icon"
              :text="mark.label"
            >
              <span
                :class="[CHIP, 'text-2xs text-dimmed']"
                :aria-label="mark.label"
              >
                <UIcon
                  :name="mark.icon"
                  class="text-2xs"
                />
                <span class="card-id select-none">{{ mark.count }}</span>
              </span>
            </component>
          </span>

          <!-- A parent's progress is a readout; a sub-task's parent is a link,
               so it is a button. Both light the family on hover or focus. -->
          <component
            :is="wrap(UTooltip)"
            v-if="relation"
            :text="relation.label"
          >
            <component
              :is="relation.kind === 'parent' ? 'button' : 'span'"
              :type="relation.kind === 'parent' ? 'button' : undefined"
              class="order-3 text-2xs"
              :class="[
                CHIP,
                relation.complete ? 'text-success' : 'text-dimmed',
                relation.kind === 'parent' ? 'rounded-md hover:bg-elevated hover:text-toned transition-colors' : ''
              ]"
              :aria-label="relation.kind === 'parent' ? `Open parent, ${relation.label}` : relation.label"
              @pointerenter="light(true)"
              @pointerleave="light(false)"
              @focus="light(true)"
              @blur="light(false)"
              @click="openParent"
            >
              <UIcon
                :name="relation.icon"
                class="text-2xs shrink-0"
              />
              <span class="card-id select-none">{{ relation.text }}</span>
            </component>
          </component>

          <component
            :is="wrap(TagMenu)"
            :tags="kanbanContext.tags.value || []"
            :selected-ids="selectedTagIds"
            :open="openControl === 'tags'"
            :content="menuPlacement"
            @update:open="(v: boolean) => setOpen('tags', !!v)"
            @toggle="toggleTag"
          >
            <component
              :is="wrap(UTooltip)"
              text="Tags"
              :disabled="tipOff('tags')"
            >
              <button
                v-if="kanbanContext.tags.value?.length"
                type="button"
                :class="[GHOST, ghost, 'order-1 rounded-md text-dimmed']"
                :aria-label="tagsFieldLabel(kanbanContext.tags.value || [], selectedTagIds)"
                @blur="releaseTip('tags')"
                @pointerleave="releaseTip('tags')"
                @click.stop="armFor('tags')"
              >
                <UIcon
                  name="i-lucide-tag"
                  class="text-2xs"
                />
              </button>
            </component>
          </component>

          <!--
            The edge bar is the readout; this is only the control.

            It used to be both: high and urgent stayed lit in their own colour
            with the urgent one pulsing, right beside an edge bar already saying
            exactly that in the same colour with the same pulse. Two marks for
            one fact, and it made priority the only field on the strip whose
            control changed shape with its value — the row read as three buttons
            and one status light.

            So it becomes the field's own glyph, dimmed and hover-revealed, the
            same as tags. Nothing is lost from the card face: high and urgent
            keep the bar, and medium and low were never marked here either, by
            design. The value moves into the tooltip, which is what the assignee
            slot already does for the one other field whose control can't spell
            out its own value.
          -->
          <component
            :is="wrap(PriorityMenu)"
            :priority="card.priority"
            :open="openControl === 'priority'"
            :content="menuPlacement"
            @update:open="(v: boolean) => setOpen('priority', !!v)"
            @select="(p: string) => emit('update', card.id, { priority: p })"
          >
            <component
              :is="wrap(UTooltip)"
              :text="`Priority: ${priorityLabel(card.priority)}`"
              :disabled="tipOff('priority')"
            >
              <button
                type="button"
                :class="[GHOST, ghost, 'order-1 rounded-md text-dimmed']"
                :aria-label="priorityFieldLabel(card.priority)"
                @blur="releaseTip('priority')"
                @pointerleave="releaseTip('priority')"
                @click.stop="armFor('priority')"
              >
                <UIcon
                  name="i-lucide-signal"
                  class="text-2xs"
                />
              </button>
            </component>
          </component>

          <component
            :is="wrap(DueDatePicker)"
            :open="openControl === 'due'"
            :popover-options="{ ...menuPlacement, onCloseAutoFocus }"
            :model-value="card.dueDate"
            @update:open="(v: boolean) => setOpen('due', v)"
            @update:model-value="(val: string | null) => emit('update', card.id, { dueDate: val })"
          >
            <component
              :is="wrap(UTooltip)"
              :text="card.dueDate ? dueDateSummary(card.dueDate) : 'Due date'"
              :disabled="tipOff('due')"
            >
              <button
                type="button"
                class="whitespace-nowrap text-2xs font-semibold rounded-md"
                :class="paintDue
                  ? [SLOT_DUE, 'order-4', DUE_CHIP[dueStatus ?? 'future']]
                  : [GHOST, ghost, 'order-1 text-dimmed']"
                :aria-label="dueDateFieldLabel(card.dueDate)"
                @blur="releaseTip('due')"
                @pointerleave="releaseTip('due')"
                @click.stop="armFor('due')"
              >
                <!-- A set date is its own label: "Nov 23" needs no calendar beside it,
                     and its colour says overdue (red) or due soon (orange). The
                     glyph is only the empty field's editor. -->
                <UIcon
                  v-if="!paintDue"
                  name="i-lucide-calendar-plus"
                  class="text-2xs"
                />
                <span
                  v-if="paintDue"
                  class="select-none"
                >{{ formatDueDate(card.dueDate!) }}</span>
              </button>
            </component>
          </component>

          <!-- Assignee: a real avatar, and absent when unassigned — the assign
               control takes its place on hover rather than an "N/A" pill. -->
          <component
            :is="wrap(AssigneeMenu)"
            :members="kanbanContext.members.value"
            :assignee-id="card.assignee?.id"
            :open="openControl === 'assignee'"
            :content="menuPlacement"
            @update:open="(v: boolean) => setOpen('assignee', !!v)"
            @select="(id: string | null) => emit('update', card.id, { assigneeId: id })"
          >
            <!-- The one tooltip that isn't just the field's name. An avatar is the
                 only value here rendered as a picture rather than as text or
                 colour, so naming the person is the only one that adds anything
                 the card isn't already showing. -->
            <component
              :is="wrap(UTooltip)"
              :text="card.assignee ? `Assigned to ${card.assignee.name}` : 'Assignee'"
              :disabled="tipOff('assignee')"
            >
              <button
                type="button"
                :class="paintAssignee
                  ? [SLOT, 'order-5 rounded-full']
                  : [GHOST, ghost, 'order-1 rounded-md text-dimmed']"
                :aria-label="assigneeFieldLabel(kanbanContext.members.value, card.assignee?.id)"
                @blur="releaseTip('assignee')"
                @pointerleave="releaseTip('assignee')"
                @click.stop="armFor('assignee')"
              >
                <UiAvatar
                  v-if="paintAssignee"
                  :src="card.assignee!.avatarUrl || undefined"
                  :alt="card.assignee!.name"
                  :kind="card.assignee!.kind"
                  :color="card.assignee!.color"
                  size="2xs"
                />
                <UIcon
                  v-else
                  :name="card.assignee ? 'i-lucide-user' : 'i-lucide-user-plus'"
                  class="text-2xs"
                />
              </button>
            </component>
          </component>
        </div>
      </div>
    </div>
  </div>
</template>
