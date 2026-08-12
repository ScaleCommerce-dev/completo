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
 * One layout for both surfaces: labelled rows work in a 640px modal and a 260px
 * sidebar alike, and the 2x2 grid did not.
 */
const props = defineProps<{
  statuses: CardStatus[]
  members?: Member[]
  tags?: Tag[]
  /** Sentinel for "nobody", since a select needs a value for the empty case. */
  unassignedValue: string
}>()

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

const TRIGGER = 'flex items-center gap-1.5 max-w-full rounded-md px-1.5 py-1 -mx-1.5 text-sm font-medium transition-colors hover:bg-elevated cursor-pointer'
</script>

<template>
  <UiFieldGroup>
    <UiFieldRow
      label="Status"
      icon="i-lucide-circle-dot"
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
    </UiFieldRow>

    <UiFieldRow
      label="Assignee"
      icon="i-lucide-user"
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
    </UiFieldRow>

    <UiFieldRow
      label="Priority"
      icon="i-lucide-signal"
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
    </UiFieldRow>

    <UiFieldRow
      label="Due"
      icon="i-lucide-calendar"
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
    </UiFieldRow>

    <UiFieldRow
      v-if="tags?.length"
      label="Tags"
      icon="i-lucide-tag"
      align="start"
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
    </UiFieldRow>
  </UiFieldGroup>
</template>
