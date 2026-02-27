<script setup lang="ts">
interface CardData {
  id: number
  title: string
  description?: string | null
  priority: string
  statusId: string
  assigneeId?: string | null
  dueDate?: string | null
  tags?: Array<{ id: string, name: string, color: string }>
}

interface StatusItem {
  id: string
  name: string
  color?: string | null
}

interface MemberItem {
  id: string
  name: string
  avatarUrl?: string | null
}

const props = defineProps<{
  card?: CardData
  statuses: StatusItem[]
  members?: MemberItem[]
  tags?: Array<{ id: string, name: string, color: string }>
  statusId?: string
  projectKey?: string
  projectSlug?: string
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  create: [data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }]
  update: [cardId: number, updates: Record<string, unknown>, tagIds: string[]]
  delete: [cardId: number]
}>()

const isEdit = computed(() => !!props.card)

const title = ref('')
const description = ref('')
const priority = ref('medium')
const selectedStatusId = ref('')
const UNASSIGNED = '__unassigned__'
const selectedAssigneeId = ref(UNASSIGNED)
const selectedTagIds = ref<string[]>([])
const selectedDueDate = ref<string | null>(null)
const dueDateOpen = ref(false)
const editingDescription = ref(false)
const titleInput = ref<HTMLInputElement>()
const descriptionEditorRef = ref<{ startEditing: () => void }>()
const showDeleteConfirm = ref(false)

const selectedTagNames = computed(() => (props.tags || []).filter(t => selectedTagIds.value.includes(t.id)).map(t => t.name))

const priorityColorMap: Record<string, 'error' | 'warning' | 'primary' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  medium: 'primary',
  low: 'neutral'
}

const priorityMenuItems = computed(() => [[
  ...PRIORITIES.slice().reverse().map(p => ({
    label: p.label,
    icon: p.icon,
    color: priorityColorMap[p.value],
    type: 'checkbox' as const,
    checked: priority.value === p.value,
    onSelect() {
      priority.value = p.value
    }
  }))
]])

const statusItems = computed(() =>
  props.statuses.map(c => ({ label: c.name, value: c.id }))
)

const memberItems = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED },
  ...(props.members || []).map(m => ({ label: m.name, value: m.id }))
])

const selectedStatusColor = computed(() => {
  const col = props.statuses.find(c => c.id === selectedStatusId.value)
  return col?.color || '#6366f1'
})

// Sync from card prop (edit mode)
watch(() => props.card, (card) => {
  if (card) {
    title.value = card.title || ''
    description.value = card.description || ''
    priority.value = card.priority || 'medium'
    selectedStatusId.value = card.statusId || ''
    selectedAssigneeId.value = card.assigneeId || UNASSIGNED
    selectedTagIds.value = (card.tags || []).map((t: { id: string }) => t.id)
    selectedDueDate.value = card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] ?? null : null
    editingDescription.value = false
    showDeleteConfirm.value = false
  }
}, { immediate: true })

function startEditingDescription() {
  editingDescription.value = true
  nextTick(() => descriptionEditorRef.value?.startEditing())
}

function toggleTag(tagId: string) {
  const idx = selectedTagIds.value.indexOf(tagId)
  if (idx >= 0) {
    selectedTagIds.value = selectedTagIds.value.filter(id => id !== tagId)
  } else {
    selectedTagIds.value = [...selectedTagIds.value, tagId]
  }
}

function reset() {
  title.value = ''
  description.value = ''
  priority.value = 'medium'
  selectedAssigneeId.value = UNASSIGNED
  selectedTagIds.value = []
  selectedDueDate.value = null
  editingDescription.value = false
  showDeleteConfirm.value = false
}

function submit() {
  if (!title.value.trim() || !selectedStatusId.value) return

  const assigneeId = selectedAssigneeId.value === UNASSIGNED ? null : selectedAssigneeId.value

  if (isEdit.value) {
    emit('update', props.card!.id, {
      title: title.value.trim(),
      description: description.value.trim(),
      priority: priority.value,
      statusId: selectedStatusId.value,
      assigneeId,
      dueDate: selectedDueDate.value || null
    }, selectedTagIds.value)
  } else {
    emit('create', {
      title: title.value.trim(),
      description: description.value.trim(),
      priority: priority.value,
      statusId: selectedStatusId.value,
      assigneeId,
      tagIds: selectedTagIds.value,
      dueDate: selectedDueDate.value || null
    })
    reset()
  }

  open.value = false
}

function confirmDelete() {
  if (!props.card) return
  showDeleteConfirm.value = false
  emit('delete', props.card.id)
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    e.stopImmediatePropagation()
    submit()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeydown, true)
    // Sync statusId prop for create mode
    if (!isEdit.value && props.statusId) {
      selectedStatusId.value = props.statusId
    }
  } else {
    document.removeEventListener('keydown', handleKeydown, true)
  }
  if (!isOpen) {
    showDeleteConfirm.value = false
    if (!isEdit.value) reset()
  }
  if (isOpen && !isEdit.value) {
    nextTick(() => titleInput.value?.focus())
  }
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{
      content: 'sm:max-w-[640px]',
      header: 'hidden',
      body: 'p-0 sm:p-0',
      footer: 'p-0 sm:p-0'
    }"
  >
    <template #body>
      <form
        class="flex flex-col"
        @submit.prevent="submit"
      >
        <!-- Card ID (edit only) -->
        <div
          v-if="isEdit"
          class="flex items-center justify-between px-5 pt-5 pb-2"
        >
          <span class="font-mono text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
            {{ formatTicketId(projectKey, card!.id) }}
          </span>
          <NuxtLink
            v-if="projectSlug"
            :to="`/projects/${projectSlug}/cards/${formatTicketId(projectKey, card!.id)}`"
            class="flex items-center gap-1 text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            @click="open = false"
          >
            <UIcon
              name="i-lucide-expand"
              class="text-[14px]"
            />
          </NuxtLink>
        </div>

        <!-- Title input -->
        <div :class="isEdit ? 'px-5 pb-1' : 'px-5 pt-5 pb-1'">
          <input
            ref="titleInput"
            v-model="title"
            type="text"
            placeholder="Card title..."
            class="w-full text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-2 transition-colors"
          >
        </div>

        <!-- Description -->
        <div class="px-5 pt-1">
          <!-- Create mode: always show editor -->
          <template v-if="!isEdit">
            <DescriptionEditor
              ref="descriptionEditorRef"
              v-model="description"
              :title="title"
              :tags="selectedTagNames"
              :priority="priority"
              :project-slug="projectSlug"
              :project-key="projectKey"
              :members="members"
              :card-id="card?.id"
              :min-height="120"
              :max-height="300"
            />
          </template>

          <!-- Edit mode: read-only view with edit toggle -->
          <template v-else>
            <!-- Description label + edit button -->
            <div class="flex items-center gap-1.5 mb-1.5">
              <UIcon
                name="i-lucide-text"
                class="text-[13px] text-zinc-400 dark:text-zinc-500"
              />
              <span class="text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500">Description</span>
              <button
                v-if="!editingDescription"
                type="button"
                class="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all"
                @click="startEditingDescription"
              >
                <UIcon
                  name="i-lucide-pencil"
                  class="text-[12px]"
                />
                {{ description ? 'Edit' : 'Add' }}
              </button>
            </div>

            <DescriptionEditor
              v-if="editingDescription"
              ref="descriptionEditorRef"
              v-model="description"
              :title="title"
              :tags="selectedTagNames"
              :priority="priority"
              :project-slug="projectSlug"
              :project-key="projectKey"
              :members="members"
              :card-id="card?.id"
              :min-height="120"
              :max-height="300"
              @escape="editingDescription = false"
            />
            <div
              v-else-if="description"
              class="max-h-[300px] overflow-y-auto select-text"
            >
              <ProseDescription :content="description" />
            </div>
          </template>
        </div>

        <!-- Properties -->
        <div class="mx-5 mt-3 grid grid-cols-2 gap-2">
          <!-- Status -->
          <div class="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 px-2.5 py-1.5">
            <span
              class="w-2 h-2 rounded-full shrink-0 transition-colors"
              :style="{ backgroundColor: selectedStatusColor }"
            />
            <USelect
              v-model="selectedStatusId"
              :items="statusItems"
              value-key="value"
              class="flex-1"
              size="xs"
              variant="ghost"
            />
          </div>

          <!-- Priority -->
          <div class="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 px-2.5 py-1.5">
            <UDropdownMenu
              :items="priorityMenuItems"
              :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 text-[13px] font-medium capitalize transition-all hover:opacity-80"
                :style="{ color: priorityColor(priority) }"
              >
                <span class="w-[13px] flex items-center justify-center shrink-0"><UIcon
                  :name="priorityIcon(priority)"
                  class="text-[13px]"
                /></span>
                {{ priority }}
                <UIcon
                  name="i-lucide-chevron-down"
                  class="text-[10px] opacity-50"
                />
              </button>
            </UDropdownMenu>
          </div>

          <!-- Assignee -->
          <div class="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 px-2.5 py-1.5">
            <UIcon
              name="i-lucide-user"
              class="text-[12px] text-zinc-400 shrink-0"
            />
            <USelect
              v-model="selectedAssigneeId"
              :items="memberItems"
              value-key="value"
              class="flex-1"
              size="xs"
              variant="ghost"
            />
          </div>

          <!-- Due Date -->
          <div class="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 px-2.5 py-1.5">
            <UIcon
              name="i-lucide-calendar"
              class="text-[12px] text-zinc-400 shrink-0"
            />
            <DueDatePicker
              v-model:open="dueDateOpen"
              :model-value="selectedDueDate"
              :popover-options="{ align: 'start', side: 'bottom', sideOffset: 4 }"
              @update:model-value="selectedDueDate = $event"
            >
              <button
                type="button"
                class="flex items-center gap-1 text-[13px] font-medium transition-all hover:text-indigo-500"
                :style="selectedDueDate ? { color: dueDateColor(getDueDateStatus(selectedDueDate)) } : {}"
                :class="!selectedDueDate ? 'text-zinc-400 dark:text-zinc-500' : ''"
              >
                {{ selectedDueDate ? formatDueDate(selectedDueDate) : 'Set date' }}
                <UIcon
                  name="i-lucide-chevron-down"
                  class="text-[10px] opacity-50"
                />
              </button>
            </DueDatePicker>
          </div>
        </div>

        <!-- Tags -->
        <div
          v-if="tags?.length"
          class="mx-5 mt-3"
        >
          <div class="flex items-center gap-1.5 mb-2">
            <UIcon
              name="i-lucide-tag"
              class="text-[12px] text-zinc-400"
            />
            <span class="text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500">Tags</span>
          </div>
          <UPopover :content="{ align: 'start', side: 'bottom', sideOffset: 4 }">
            <button
              type="button"
              class="flex flex-wrap gap-1 items-center rounded-md px-1.5 py-0.5 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <template v-if="selectedTagIds.length">
                <TagPill
                  v-for="tag in tags.filter(t => selectedTagIds.includes(t.id))"
                  :key="tag.id"
                  :name="tag.name"
                  :color="tag.color"
                />
                <UIcon
                  name="i-lucide-chevron-down"
                  class="text-[10px] opacity-50 text-zinc-400"
                />
              </template>
              <span
                v-else
                class="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full text-[10.5px] font-bold leading-none tracking-wide uppercase opacity-60 hover:opacity-80 transition-opacity"
                style="color: #a1a1aa; background-color: #a1a1aa20; box-shadow: inset 0 0 0 1px #a1a1aa35"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="text-[10px]"
                />
                Add tag
              </span>
            </button>
            <template #content>
              <TagToggleList
                :tags="tags"
                :selected-ids="selectedTagIds"
                @toggle="toggleTag"
              />
            </template>
          </UPopover>
        </div>

        <!-- Attachments (edit mode only) -->
        <div
          v-if="isEdit"
          class="mx-5 mt-3"
        >
          <AttachmentList :card-id="card?.id" />
        </div>

        <!-- Delete confirmation (edit mode only) -->
        <div
          v-if="isEdit && showDeleteConfirm"
          class="mx-5 mt-3 rounded-lg border border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3 flex flex-col gap-2"
        >
          <p class="text-[12px] font-medium text-red-600 dark:text-red-400 leading-relaxed">
            Are you sure you want to delete this card?
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all"
              @click="confirmDelete"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-[13px]"
              />
              Delete
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 px-5 pt-4 pb-5 mt-4 border-t border-zinc-100 dark:border-zinc-700/40">
          <button
            v-if="isEdit && !showDeleteConfirm"
            type="button"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all mr-auto"
            @click="showDeleteConfirm = true"
          >
            <UIcon
              name="i-lucide-trash-2"
              class="text-[13px]"
            />
            Delete
          </button>
          <span class="text-[10px] font-mono text-zinc-300 dark:text-zinc-600 hidden sm:block">
            <kbd class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500">&#8984;&#x23CE;</kbd>
          </span>
          <button
            type="submit"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!title.trim()"
          >
            <UIcon
              v-if="!isEdit"
              name="i-lucide-plus"
              class="text-[14px]"
            />
            {{ isEdit ? 'Save' : 'Create' }}
          </button>
        </div>
      </form>
    </template>
  </UModal>
</template>
