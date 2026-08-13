<script setup lang="ts">
import type { BoardCard } from '~/types/card'

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
 *  - **Tags,** at most two plus a count, as a coloured dot and a name rather
 *    than a filled pill. See TagPill's `quiet` variant.
 *  - **A footer of two zones.** Facts on the left — the ticket ID, an attachment
 *    count, a description glyph — and the card's four fields on the right.
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
 * Medium and low priority stay invisible until the card is hovered — the control
 * is there, the ink is not. The same is now true of due date and tags, which
 * previously rendered *only* when set, so a card with neither offered no way to
 * acquire one short of opening it.
 *
 * **The description is per-board** (`boards.show_description`, default on), which
 * is how the list view has always treated it — an opt-in field column. Removing
 * it from the card face outright fixed the wall-of-paragraphs problem and lost
 * the at-a-glance context with it; a switch is the honest answer, because whether
 * an excerpt helps depends entirely on how that team writes descriptions. Two
 * lines, `text-xs` and `text-muted`, so it reads as subordinate to the title
 * rather than competing with it the way the pre-overhaul card did.
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
  showDescription: ComputedRef<boolean>
}>('kanbanContext')!

/**
 * Stripped, because the raw source puts `## Kontext` and `- [ ]` on the card
 * face. `stripMarkdown` is the same helper `ListCellDescription` uses, so the
 * two views excerpt a description identically.
 */
const descriptionExcerpt = computed(() => {
  if (!kanbanContext.showDescription.value || !props.card.description) return ''
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

const VISIBLE_TAGS = 2
const visibleTags = computed(() => (props.card.tags || []).slice(0, VISIBLE_TAGS))
const hiddenTagCount = computed(() => Math.max(0, (props.card.tags?.length || 0) - VISIBLE_TAGS))
const allTagNames = computed(() => (props.card.tags || []).map(t => t.name).join(', '))

const dueStatus = computed(() => getDueDateStatus(props.card.dueDate))

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
      v-if="priorityBarClass(card.priority)"
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
    -->
    <UTooltip text="Open full page">
      <NuxtLink
        v-if="detailUrl"
        :to="detailUrl"
        class="absolute top-2 right-2 z-10 text-dimmed hover:text-primary"
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
      <p class="text-sm font-semibold leading-snug text-highlighted tracking-[-0.01em] line-clamp-2 pr-6">
        {{ card.title }}
      </p>

      <p
        v-if="descriptionExcerpt"
        class="text-xs leading-relaxed text-muted mt-1 line-clamp-2"
      >
        {{ descriptionExcerpt }}
      </p>

      <!-- Tags, when there are any. A dot carries the colour; the name is text. -->
      <div
        v-if="visibleTags.length"
        class="flex items-center gap-2 mt-1.5 min-w-0"
      >
        <TagPill
          v-for="tag in visibleTags"
          :key="tag.id"
          :name="tag.name"
          :color="tag.color"
          variant="quiet"
          class="shrink-0 min-w-0"
        />
        <UTooltip
          v-if="hiddenTagCount"
          :text="allTagNames"
        >
          <span class="text-2xs font-medium text-dimmed shrink-0">+{{ hiddenTagCount }}</span>
        </UTooltip>
      </div>

      <!-- Footer. Identity on the left, decision signals on the right. -->
      <div class="flex items-center gap-1.5 mt-1.5 min-w-0">
        <TicketIdCopy
          :project-key="kanbanContext.projectKey.value"
          :project-slug="kanbanContext.projectSlug.value"
          :card-id="card.id"
          size="xs"
        />

        <!-- Says a spec exists, for boards that don't show the excerpt. When the
             excerpt is right there, the glyph is restating what you can read. -->
        <UTooltip
          v-if="card.description && !descriptionExcerpt"
          text="Has a description"
        >
          <UIcon
            name="i-lucide-align-left"
            class="text-2xs text-dimmed shrink-0"
          />
        </UTooltip>

        <span
          v-if="card.attachmentCount"
          class="flex items-center gap-0.5 text-2xs text-dimmed whitespace-nowrap shrink-0"
          :aria-label="`${card.attachmentCount} attachments`"
        >
          <UIcon
            name="i-lucide-paperclip"
            class="text-2xs"
          />
          <span class="card-id select-none">{{ card.attachmentCount }}</span>
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
        <div class="ml-auto flex items-center gap-0.5 shrink-0">
          <TagMenu
            :tags="kanbanContext.tags.value || []"
            :selected-ids="selectedTagIds"
            :open="openControl === 'tags'"
            :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
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

          <!-- Priority. High and urgent are always lit; medium and low are a
               control without a colour, so they wait for hover. -->
          <PriorityMenu
            :priority="card.priority"
            :open="openControl === 'priority'"
            :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
            @update:open="v => setOpen('priority', !!v)"
            @select="p => emit('update', card.id, { priority: p })"
          >
            <template #default="{ label }">
              <UTooltip
                text="Priority"
                :disabled="tipOff('priority')"
              >
                <button
                  type="button"
                  :class="[
                    SLOT,
                    'rounded-md',
                    priorityTextClass(card.priority),
                    isSignalPriority(card.priority)
                      ? (card.priority === 'urgent' ? 'priority-urgent-pulse' : '')
                      : reveal
                  ]"
                  :aria-label="label"
                  @blur="releaseTip('priority')"
                  @pointerleave="releaseTip('priority')"
                  @click.stop
                >
                  <UIcon
                    :name="priorityIcon(card.priority)"
                    class="text-xs"
                  />
                </button>
              </UTooltip>
            </template>
          </PriorityMenu>

          <DueDatePicker
            :open="openControl === 'due'"
            :popover-options="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8, onCloseAutoFocus }"
            :model-value="card.dueDate"
            @update:open="v => setOpen('due', v)"
            @update:model-value="val => emit('update', card.id, { dueDate: val })"
          >
            <UTooltip
              text="Due date"
              :disabled="tipOff('due')"
            >
              <button
                type="button"
                class="whitespace-nowrap text-2xs font-semibold rounded-md"
                :class="card.dueDate
                  ? [SLOT_TEXT, dueDateTextClass(dueStatus)]
                  : [SLOT, reveal, 'text-dimmed']"
                :aria-label="card.dueDate ? `Due ${formatDueDate(card.dueDate)}. Change due date` : 'Set a due date'"
                @blur="releaseTip('due')"
                @pointerleave="releaseTip('due')"
                @click.stop
              >
                <UIcon
                  :name="card.dueDate ? dueDateIcon(dueStatus) : 'i-lucide-calendar-plus'"
                  :class="card.dueDate ? 'text-2xs' : 'text-xs'"
                />
                <span
                  v-if="card.dueDate"
                  class="select-none"
                >{{ formatDueDate(card.dueDate) }}</span>
              </button>
            </UTooltip>
          </DueDatePicker>

          <!-- Assignee: a real avatar, and absent when unassigned — the assign
               control takes its place on hover rather than an "N/A" pill. -->
          <AssigneeMenu
            :members="kanbanContext.members.value"
            :assignee-id="card.assignee?.id"
            :open="openControl === 'assignee'"
            :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
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
                    card.assignee ? 'rounded-full' : ['rounded-md text-dimmed', reveal]
                  ]"
                  :aria-label="label"
                  @blur="releaseTip('assignee')"
                  @pointerleave="releaseTip('assignee')"
                  @click.stop
                >
                  <UAvatar
                    v-if="card.assignee"
                    :src="card.assignee.avatarUrl || undefined"
                    :alt="card.assignee.name"
                    size="2xs"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-user-plus"
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
