<script setup lang="ts">
import type { BoardCard } from '~/types/card'
import type { CardField } from '#shared/utils/card-fields'

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
  members: ComputedRef<Array<{ id: string, name: string, avatarUrl: string | null }> | undefined>
  tags: ComputedRef<Array<{ id: string, name: string, color: string }> | undefined>
  cardFieldVisible: ComputedRef<(key: CardField) => boolean>
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
 * `SLOT_TEXT` is the same box with room for a label — only the due date has one,
 * and only when a date is set.
 */
const SLOT = 'flex items-center justify-center size-6 shrink-0 hover:bg-elevated transition-colors'
const SLOT_TEXT = 'flex items-center gap-1 h-6 px-1.5 shrink-0 cursor-pointer hover:bg-elevated transition-colors'

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
    class="kanban-card lift group relative cursor-pointer overflow-hidden rounded-lg bg-default border border-default shadow-raise hover:border-accented"
    @click="$emit('click')"
  >
    <!-- Priority edge bar. High and urgent only. -->
    <span
      v-if="shows('priority') && priorityBarClass(card.priority)"
      class="absolute left-0 top-0 bottom-0 w-[2.5px]"
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
    <UTooltip text="Open full page">
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
    </UTooltip>

    <div class="p-2.5 pl-3">
      <!-- The object. Nothing above it. -->
      <p class="text-sm font-semibold leading-snug text-highlighted tracking-name line-clamp-2 pr-6">
        {{ card.title }}
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
          <UTooltip :text="allTagNames">
            <span class="text-2xs font-medium text-dimmed">+{{ hiddenTagCount }}</span>
          </UTooltip>
        </div>
      </div>

      <!-- Footer. Identity on the left, decision signals on the right. -->
      <div class="flex items-center gap-1.5 mt-1.5 min-w-0">
        <TicketIdCopy
          v-if="shows('ticketId')"
          :project-key="kanbanContext.projectKey.value"
          :project-slug="kanbanContext.projectSlug.value"
          :card-id="card.id"
          size="xs"
        />

        <span
          v-for="mark in contentMarks"
          :key="mark.icon"
          class="flex items-center gap-0.5 text-2xs text-dimmed whitespace-nowrap shrink-0"
          :aria-label="mark.label"
        >
          <UIcon
            :name="mark.icon"
            class="text-2xs"
          />
          <span class="card-id select-none">{{ mark.count }}</span>
        </span>

        <!--
          Four fixed slots — tags, priority, due, assignee — each showing its
          value when there is one and a ghost on hover when there isn't. Due date
          and tags previously rendered only when set, so a card with neither had
          no way to acquire one without being opened.

          The tag pill row above stays the readout; this is the editor. Keeping
          the control in one place rather than moving it into the pill row when
          pills exist is what makes the cluster learnable — every card's fields
          are at the same four positions.
        -->
        <div
          ref="strip"
          class="ml-auto flex items-center gap-0.5 shrink-0"
          @pointerdown.capture="anchorToStrip"
          @keydown.capture="anchorToStrip"
        >
          <TagMenu
            :tags="kanbanContext.tags.value || []"
            :selected-ids="selectedTagIds"
            :open="openControl === 'tags'"
            :content="menuPlacement"
            @update:open="v => setOpen('tags', !!v)"
            @toggle="toggleTag"
          >
            <template #default="{ label }">
              <UTooltip
                text="Tags"
                :disabled="tipOff('tags')"
              >
                <button
                  v-if="kanbanContext.tags.value?.length"
                  type="button"
                  :class="[SLOT, reveal, 'rounded-md text-dimmed']"
                  :aria-label="label"
                  @blur="releaseTip('tags')"
                  @pointerleave="releaseTip('tags')"
                  @click.stop
                >
                  <UIcon
                    name="i-lucide-tag"
                    class="text-xs"
                  />
                </button>
              </UTooltip>
            </template>
          </TagMenu>

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
          <PriorityMenu
            :priority="card.priority"
            :open="openControl === 'priority'"
            :content="menuPlacement"
            @update:open="v => setOpen('priority', !!v)"
            @select="p => emit('update', card.id, { priority: p })"
          >
            <template #default="{ label }">
              <UTooltip
                :text="`Priority: ${priorityLabel(card.priority)}`"
                :disabled="tipOff('priority')"
              >
                <button
                  type="button"
                  :class="[SLOT, reveal, 'rounded-md text-dimmed']"
                  :aria-label="label"
                  @blur="releaseTip('priority')"
                  @pointerleave="releaseTip('priority')"
                  @click.stop
                >
                  <UIcon
                    name="i-lucide-signal"
                    class="text-xs"
                  />
                </button>
              </UTooltip>
            </template>
          </PriorityMenu>

          <DueDatePicker
            :open="openControl === 'due'"
            :popover-options="{ ...menuPlacement, onCloseAutoFocus }"
            :model-value="card.dueDate"
            @update:open="v => setOpen('due', v)"
            @update:model-value="val => emit('update', card.id, { dueDate: val })"
          >
            <UTooltip
              :text="card.dueDate ? `Due ${formatDueDate(card.dueDate)}` : 'Due date'"
              :disabled="tipOff('due')"
            >
              <button
                type="button"
                class="whitespace-nowrap text-2xs font-semibold rounded-md"
                :class="paintDue
                  ? [SLOT_TEXT, dueDateTextClass(dueStatus)]
                  : [SLOT, reveal, 'text-dimmed']"
                :aria-label="card.dueDate ? `Due ${formatDueDate(card.dueDate)}. Change due date` : 'Set a due date'"
                @blur="releaseTip('due')"
                @pointerleave="releaseTip('due')"
                @click.stop
              >
                <UIcon
                  :name="paintDue ? dueDateIcon(dueStatus) : 'i-lucide-calendar-plus'"
                  :class="paintDue ? 'text-2xs' : 'text-xs'"
                />
                <span
                  v-if="paintDue"
                  class="select-none"
                >{{ formatDueDate(card.dueDate!) }}</span>
              </button>
            </UTooltip>
          </DueDatePicker>

          <!-- Assignee: a real avatar, and absent when unassigned — the assign
               control takes its place on hover rather than an "N/A" pill. -->
          <AssigneeMenu
            :members="kanbanContext.members.value"
            :assignee-id="card.assignee?.id"
            :open="openControl === 'assignee'"
            :content="menuPlacement"
            @update:open="v => setOpen('assignee', !!v)"
            @select="id => emit('update', card.id, { assigneeId: id })"
          >
            <template #default="{ label }">
              <!-- The one tooltip that isn't just the slot's name. An avatar is the
                 only value here rendered as a picture rather than as text or
                 colour, so naming the person is the only one that adds anything
                 the card isn't already showing. -->
              <UTooltip
                :text="card.assignee ? `Assigned to ${card.assignee.name}` : 'Assignee'"
                :disabled="tipOff('assignee')"
              >
                <button
                  type="button"
                  :class="[
                    SLOT,
                    paintAssignee ? 'rounded-full' : ['rounded-md text-dimmed', reveal]
                  ]"
                  :aria-label="label"
                  @blur="releaseTip('assignee')"
                  @pointerleave="releaseTip('assignee')"
                  @click.stop
                >
                  <UiAvatar
                    v-if="paintAssignee"
                    :src="card.assignee!.avatarUrl || undefined"
                    :alt="card.assignee!.name"
                    size="2xs"
                  />
                  <UIcon
                    v-else
                    :name="card.assignee ? 'i-lucide-user' : 'i-lucide-user-plus'"
                    class="text-xs"
                  />
                </button>
              </UTooltip>
            </template>
          </AssigneeMenu>
        </div>
      </div>
    </div>
  </div>
</template>
