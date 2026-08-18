<script setup lang="ts">
import type { CardStatus, Member, Tag } from '~/types/card'

/**
 * A card's status, assignee, priority, due date and tags.
 *
 * CardModal and the card detail page each had their own version of this, with
 * different controls for the same fields: the modal used a 2x2 grid mixing two
 * USelects with two hand-rolled buttons — different heights, different focus
 * behaviour, different type ramps — while the page used UDropdownMenu buttons in
 * stacked rows. Same data, two vocabularies, and the identical hardcoded "Add
 * tag" chip (`#a1a1aa` inline, fixed in both themes) copy-pasted into both.
 *
 * One set of controls, two layouts:
 *
 *  - `rows` — labelled rows in a bordered group. Right for the card detail page's
 *    rail, where the properties *are* the panel and there is vertical room.
 *  - `compact` — the same five controls as a wrapped run of chips. Right for the
 *    card panel you open forty times a day: five labelled rows cost 210px there,
 *    which pushed the description and every comment below the fold before you had
 *    read a word. A label column that repeats "Status / Assignee / Priority / Due
 *    / Tags" on every card open is an editor's form, not a card.
 *
 * Both layouts render the identical triggers from the identical definitions —
 * splitting them into two components is how this file's two predecessors ended up
 * with different controls for the same five fields.
 */
const props = withDefaults(defineProps<{
  statuses: CardStatus[]
  members?: Member[]
  tags?: Tag[]
  /** Sentinel for "nobody", since a select needs a value for the empty case. */
  unassignedValue: string
  layout?: 'rows' | 'compact'
}>(), {
  layout: 'rows'
})

const statusId = defineModel<string>('statusId', { required: true })
const assigneeId = defineModel<string>('assigneeId', { required: true })
const priority = defineModel<string>('priority', { required: true })
const dueDate = defineModel<string | null>('dueDate', { required: true })
const tagIds = defineModel<string[]>('tagIds', { required: true })

const dueDateOpen = ref(false)

const selectedStatus = computed(() => props.statuses.find(s => s.id === statusId.value))

const selectedAssignee = computed(() =>
  assigneeId.value === props.unassignedValue
    ? null
    : (props.members || []).find(m => m.id === assigneeId.value) || null
)

const selectedTags = computed(() =>
  (props.tags || []).filter(t => tagIds.value.includes(t.id))
)

function toggleTag(tagId: string) {
  tagIds.value = tagIds.value.includes(tagId)
    ? tagIds.value.filter(id => id !== tagId)
    : [...tagIds.value, tagId]
}

const TRIGGER = computed(() => [
  'flex items-center gap-1.5 max-w-full rounded-md px-1.5 py-1 text-sm font-medium transition-colors hover:bg-elevated cursor-pointer',
  // Pulls the control's text out to the row's content edge. In compact there is no
  // label column to align with, and negative margins would eat the gap between chips.
  isCompact.value ? '' : '-mx-1.5'
])

/**
 * Compact drops the label column, so the row wrapper drops out with it and the
 * controls become flex children of one wrapping line. Props are handed over per
 * layout rather than unconditionally: `label` and `icon` on a bare `<div>` would
 * render as stray DOM attributes.
 *
 * `rows` draws the hairlines between its rows and nothing else — **no border of
 * its own.** Its only host is the card page's rail, which is already a bordered
 * card, so drawing one here put a bordered box 12px inside a bordered box: the
 * property labels sat 25px from the card's edge while the provenance rows beneath
 * them sat at 16, and the two groups visibly failed to line up. The host owns the
 * border; this owns the rows.
 */
const isCompact = computed(() => props.layout === 'compact')
const Row = computed(() => isCompact.value ? 'div' : resolveComponent('UiFieldRow'))

/**
 * A compact chip takes its natural width and wraps. Without `shrink-0` all five share
 * the line equally and every one of them truncates — "Bac… / Demo … / Med… / No …" —
 * which is a row of chips that has stopped naming anything. The cap keeps one very long
 * status or member name from taking the whole line to itself.
 */
const CHIP = computed(() => isCompact.value ? 'shrink-0 max-w-[190px]' : '')
/**
 * Tags join the same line as the rest and wrap with it.
 *
 * They used to carry `basis-full`, which put them on a line of their own
 * *always* — so a card with two tags and short property values spent two rows
 * saying what fits comfortably in one, and the break happened at a fixed place
 * rather than where the content ran out.
 *
 * `shrink-0` matters as much as dropping that: tags are the only shrinkable item
 * on the row, so without it a line overflowing by twenty pixels squeezed the
 * whole shortfall out of this one chip rather than wrapping it. `max-w-full`
 * then keeps it inside the row once it does wrap.
 */
const TAG_CHIP = computed(() => isCompact.value ? 'shrink-0 max-w-full' : '')

/**
 * Compact clamps the pills to one line and counts the rest, exactly as a board
 * card does — see `useTagOverflow`.
 *
 * This row is the card panel's *pinned* chrome: the body scrolls under it, so
 * every line it grows is a line the title, the properties and the description all
 * lose for the life of the card. Thirteen tags fit on one line in a 900px panel
 * and take four at 390px, and it was the four-line version that decided this.
 *
 * Nothing is hidden by it in any real sense — the chip is a menu trigger, so the
 * full list is one click away with the selected ones marked, and the trigger's
 * own `aria-label` still enumerates every one of them.
 *
 * `rows` is deliberately left alone. The card page's rail is a sidebar that can
 * afford to grow, and it isn't clipped, so measuring it would print a `+N` beside
 * tags that are plainly visible — hence `enabled`.
 */
const tagRow = useTemplateRef<HTMLElement>('tagRow')
const { hiddenCount: hiddenTagCount } = useTagOverflow({
  row: () => tagRow.value,
  tags: () => selectedTags.value,
  enabled: () => isCompact.value && selectedTags.value.length > 0
})

function row(label: string, icon: string, align?: 'start') {
  if (isCompact.value) return {}
  return align ? { label, icon, align } : { label, icon }
}
</script>

<template>
  <div :class="isCompact ? 'flex flex-wrap items-center gap-x-1 gap-y-1' : 'divide-y divide-default'">
    <component
      :is="Row"
      v-bind="row('Status', 'i-lucide-circle-dot')"
      :class="CHIP"
    >
      <StatusMenu
        :statuses="statuses"
        :status-id="statusId"
        :content="FIELD_MENU_ALIGN_START"
        @select="id => statusId = id"
      >
        <template #default="{ label }">
          <button
            type="button"
            :class="TRIGGER"
            :aria-label="label"
          >
            <UiStatusDot :color="selectedStatus?.color" />
            <span class="truncate text-default">{{ selectedStatus?.name || 'Pick a status' }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="text-2xs text-dimmed shrink-0"
            />
          </button>
        </template>
      </StatusMenu>
    </component>

    <component
      :is="Row"
      v-bind="row('Assignee', 'i-lucide-user')"
      :class="CHIP"
    >
      <AssigneeMenu
        :members="members"
        :assignee-id="selectedAssignee?.id"
        :content="FIELD_MENU_ALIGN_START"
        @select="id => assigneeId = id ?? unassignedValue"
      >
        <template #default="{ label }">
          <button
            type="button"
            :class="TRIGGER"
            :aria-label="label"
          >
            <UiPerson
              :person="selectedAssignee"
              empty-label="Nobody"
            />
            <UIcon
              name="i-lucide-chevron-down"
              class="text-2xs text-dimmed shrink-0"
            />
          </button>
        </template>
      </AssigneeMenu>
    </component>

    <component
      :is="Row"
      v-bind="row('Priority', 'i-lucide-signal')"
      :class="CHIP"
    >
      <PriorityMenu
        :priority="priority"
        :content="FIELD_MENU_ALIGN_START"
        @select="p => priority = p"
      >
        <template #default="{ label }">
          <button
            type="button"
            :class="[TRIGGER, priorityTextClass(priority)]"
            :aria-label="label"
          >
            <UIcon
              :name="priorityIcon(priority)"
              class="text-sm shrink-0"
            />
            <span class="truncate">{{ priorityLabel(priority) }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="text-2xs text-dimmed shrink-0"
            />
          </button>
        </template>
      </PriorityMenu>
    </component>

    <component
      :is="Row"
      v-bind="row('Due', 'i-lucide-calendar')"
      :class="CHIP"
    >
      <DueDatePicker
        v-model:open="dueDateOpen"
        :model-value="dueDate"
        :popover-options="FIELD_MENU_ALIGN_START"
        @update:model-value="dueDate = $event"
      >
        <button
          type="button"
          :class="[TRIGGER, dueDate ? dueDateTextClass(getDueDateStatus(dueDate)) : 'text-dimmed']"
          :aria-label="dueDateFieldLabel(dueDate)"
        >
          <UIcon
            :name="dueDate ? dueDateIcon(getDueDateStatus(dueDate)) : 'i-lucide-calendar'"
            class="text-sm shrink-0"
          />
          <span class="truncate">{{ dueDate ? formatDueDate(dueDate) : 'No date' }}</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="text-2xs text-dimmed shrink-0"
          />
        </button>
      </DueDatePicker>
    </component>

    <component
      :is="Row"
      v-if="tags?.length"
      v-bind="row('Tags', 'i-lucide-tag', 'start')"
      :class="TAG_CHIP"
    >
      <TagMenu
        :tags="tags"
        :selected-ids="tagIds"
        :content="FIELD_MENU_ALIGN_START"
        @toggle="toggleTag"
      >
        <template #default="{ label }">
          <!--
            The pills wrap; the chevron does not take part.

            It used to be the last item in the same wrapping flow, so when the
            row ran a few pixels short the chevron alone dropped to a second
            line, under the last pill — which reads as a rendering fault rather
            than as a wrap. Keeping it outside the wrapping group means it stays
            beside the pills at any width, and a long tag list wraps among itself
            with the chevron still at the end of the first row.

            No `max-w-full` here, deliberately. A percentage max-width inside a
            shrink-to-fit parent is circular — the parent's width depends on this
            element's content and this element's cap depends on the parent — and
            browsers resolved it by handing the button 211px when 223 were free
            and 167 to spare on the row, so the pills wrapped for no visible
            reason. The cap lives on the row item instead, where the containing
            block is definite.
          -->
          <button
            type="button"
            class="flex items-start gap-1 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-elevated cursor-pointer text-left"
            :aria-label="label"
          >
            <!-- `max-h-4` is one pill tall, so an overflowing tag wraps onto a
                 line that isn't rendered and `useTagOverflow` reads the count off
                 that. Only where the pills are the content: the empty "Add tags"
                 label is `text-sm` and a 16px clip would slice it. -->
            <span
              ref="tagRow"
              class="flex flex-wrap items-center gap-1 min-w-0"
              :class="isCompact && selectedTags.length ? 'max-h-4 overflow-hidden' : ''"
            >
              <TagPill
                v-for="tag in selectedTags"
                :key="tag.id"
                data-tag
                :name="tag.name"
                :color="tag.color"
                variant="quiet"
              />
              <span
                v-if="!selectedTags.length"
                class="inline-flex items-center gap-0.5 text-sm text-dimmed"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="text-2xs"
                />
                Add tags
              </span>
            </span>
            <!-- Outside the clipped group, so unlike the board card's this needs
                 no absolute positioning and can never be clipped by the thing it
                 is reporting on. -->
            <span
              v-if="hiddenTagCount"
              class="text-2xs font-medium text-dimmed shrink-0 mt-0.5"
            >+{{ hiddenTagCount }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="text-2xs text-dimmed shrink-0 mt-1"
            />
          </button>
        </template>
      </TagMenu>
    </component>
  </div>
</template>
