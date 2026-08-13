<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
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

const statusMenuItems = computed<DropdownMenuItem[][]>(() => [
  props.statuses.map(s => ({
    label: s.name,
    type: 'checkbox' as const,
    checked: statusId.value === s.id,
    onSelect: () => { statusId.value = s.id }
  }))
])

const assigneeMenuItems = computed<DropdownMenuItem[][]>(() => [[
  {
    label: 'Nobody',
    icon: 'i-lucide-user-x',
    type: 'checkbox' as const,
    checked: assigneeId.value === props.unassignedValue,
    onSelect: () => { assigneeId.value = props.unassignedValue }
  },
  ...(props.members || []).map(m => ({
    label: m.name,
    avatar: { src: m.avatarUrl || undefined, alt: m.name },
    type: 'checkbox' as const,
    checked: assigneeId.value === m.id,
    onSelect: () => { assigneeId.value = m.id }
  }))
]])

const priorityMenuItems = computed<DropdownMenuItem[][]>(() => [
  PRIORITIES.slice().reverse().map(p => ({
    label: p.label,
    icon: p.icon,
    color: priorityUiColor(p.value),
    type: 'checkbox' as const,
    checked: priority.value === p.value,
    onSelect: () => { priority.value = p.value }
  }))
])

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
 */
const isCompact = computed(() => props.layout === 'compact')
const Group = computed(() => isCompact.value ? 'div' : resolveComponent('UiFieldGroup'))
const Row = computed(() => isCompact.value ? 'div' : resolveComponent('UiFieldRow'))

/**
 * A compact chip takes its natural width and wraps. Without `shrink-0` all five share
 * the line equally and every one of them truncates — "Bac… / Demo … / Med… / No …" —
 * which is a row of chips that has stopped naming anything. The cap keeps one very long
 * status or member name from taking the whole line to itself.
 */
const CHIP = computed(() => isCompact.value ? 'shrink-0 max-w-[190px]' : '')
/** Tags wrap among themselves, so they get their own line rather than a 190px box. */
const TAG_CHIP = computed(() => isCompact.value ? 'basis-full min-w-0' : '')

function row(label: string, icon: string, align?: 'start') {
  if (isCompact.value) return {}
  return align ? { label, icon, align } : { label, icon }
}
</script>

<template>
  <component
    :is="Group"
    :class="isCompact ? 'flex flex-wrap items-center gap-x-1 gap-y-1' : ''"
  >
    <component
      :is="Row"
      v-bind="row('Status', 'i-lucide-circle-dot')"
      :class="CHIP"
    >
      <UDropdownMenu
        :items="statusMenuItems"
        :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
      >
        <button
          type="button"
          :class="TRIGGER"
          :aria-label="`Status: ${selectedStatus?.name || 'none'}. Change status`"
        >
          <UiStatusDot :color="selectedStatus?.color" />
          <span class="truncate text-default">{{ selectedStatus?.name || 'Pick a status' }}</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="text-2xs text-dimmed shrink-0"
          />
        </button>
      </UDropdownMenu>
    </component>

    <component
      :is="Row"
      v-bind="row('Assignee', 'i-lucide-user')"
      :class="CHIP"
    >
      <UDropdownMenu
        :items="assigneeMenuItems"
        :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
      >
        <button
          type="button"
          :class="TRIGGER"
          :aria-label="selectedAssignee ? `Assigned to ${selectedAssignee.name}. Change assignee` : 'Assign someone'"
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
      </UDropdownMenu>
    </component>

    <component
      :is="Row"
      v-bind="row('Priority', 'i-lucide-signal')"
      :class="CHIP"
    >
      <UDropdownMenu
        :items="priorityMenuItems"
        :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
      >
        <button
          type="button"
          :class="[TRIGGER, priorityTextClass(priority)]"
          :aria-label="`Priority: ${priorityLabel(priority)}. Change priority`"
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
      </UDropdownMenu>
    </component>

    <component
      :is="Row"
      v-bind="row('Due', 'i-lucide-calendar')"
      :class="CHIP"
    >
      <DueDatePicker
        v-model:open="dueDateOpen"
        :model-value="dueDate"
        :popover-options="{ align: 'start', side: 'bottom', sideOffset: 4 }"
        @update:model-value="dueDate = $event"
      >
        <button
          type="button"
          :class="[TRIGGER, dueDate ? dueDateTextClass(getDueDateStatus(dueDate)) : 'text-dimmed']"
          :aria-label="dueDate ? `Due ${formatDueDate(dueDate)}. Change due date` : 'Set a due date'"
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
      <UPopover :content="{ align: 'start', side: 'bottom', sideOffset: 4 }">
        <button
          type="button"
          class="flex flex-wrap items-center gap-1 max-w-full rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-elevated cursor-pointer text-left"
          :aria-label="selectedTags.length ? `Tags: ${selectedTags.map(t => t.name).join(', ')}. Change tags` : 'Add tags'"
        >
          <TagPill
            v-for="tag in selectedTags"
            :key="tag.id"
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
          <UIcon
            name="i-lucide-chevron-down"
            class="text-2xs text-dimmed shrink-0"
          />
        </button>
        <template #content>
          <TagToggleList
            :tags="tags"
            :selected-ids="tagIds"
            @toggle="toggleTag"
          />
        </template>
      </UPopover>
    </component>
  </component>
</template>
