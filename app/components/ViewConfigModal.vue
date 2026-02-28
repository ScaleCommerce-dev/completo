<script setup lang="ts">
const draggable = defineAsyncComponent(() => import('vuedraggable'))

interface ColumnItem {
  id: string
  name?: string
  color?: string | null
  position?: number
  field?: string
}

const props = defineProps<{
  mode: 'board' | 'list'
  columns: ColumnItem[]
  availableColumns?: ColumnItem[]
  canAddColumns?: boolean
  tags?: Array<{ id: string, name: string, color: string }>
  activeTagFilters?: string[]
  viewName?: string
  viewType?: 'board' | 'list'
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  'add': [nameOrField: string, color?: string]
  'update': [columnId: string, updates: { name?: string, color?: string }]
  'delete': [columnId: string]
  'reorder': [columns: { id: string, position: number }[]]
  'link': [statusId: string]
  'update-tag-filters': [tagIds: string[]]
  'rename': [name: string]
  'delete-view': []
}>()

// ─── List-mode field metadata ───
const ALL_FIELDS = [
  { field: 'done', label: 'Done', icon: 'i-lucide-circle-check-big' },
  { field: 'ticketId', label: 'Ticket ID', icon: 'i-lucide-hash' },
  { field: 'title', label: 'Title', icon: 'i-lucide-type' },
  { field: 'status', label: 'Status', icon: 'i-lucide-circle-dot' },
  { field: 'assignee', label: 'Assignee', icon: 'i-lucide-user' },
  { field: 'priority', label: 'Priority', icon: 'i-lucide-signal' },
  { field: 'tags', label: 'Tags', icon: 'i-lucide-tag' },
  { field: 'dueDate', label: 'Due Date', icon: 'i-lucide-calendar' },
  { field: 'createdAt', label: 'Created', icon: 'i-lucide-calendar-plus' },
  { field: 'updatedAt', label: 'Updated', icon: 'i-lucide-calendar-clock' },
  { field: 'description', label: 'Description', icon: 'i-lucide-text' }
]

const activeFields = computed(() => new Set(localColumns.value.map(c => c.field)))
const availableFields = computed(() =>
  ALL_FIELDS.filter(f => !activeFields.value.has(f.field))
)

function fieldLabel(field: string) {
  return ALL_FIELDS.find(f => f.field === field)?.label || field
}

function fieldIcon(field: string) {
  return ALL_FIELDS.find(f => f.field === field)?.icon || 'i-lucide-columns-3'
}

// ─── Local state — buffered until Save ───
const localColumns = ref<ColumnItem[]>([])
const localTagFilters = ref<Set<string>>(new Set())
const editName = ref('')

// Snapshot on open to detect changes
const snapshotColumnOrder = ref<string[]>([])
const snapshotTagFilters = ref<string[]>([])
const snapshotName = ref('')

function resetToProps() {
  localColumns.value = [...props.columns]
  localTagFilters.value = new Set(props.activeTagFilters || [])
  editName.value = props.viewName || ''
  snapshotColumnOrder.value = props.columns.map(c => c.id)
  snapshotTagFilters.value = [...(props.activeTagFilters || [])]
  snapshotName.value = props.viewName || ''
}

watch(open, (isOpen) => {
  if (isOpen) {
    resetToProps()
    showDeleteConfirm.value = false
    deleteConfirmName.value = ''
    deletingView.value = false
    showCloseWarning.value = false
  }
})

// Also sync when props change while open (e.g. after add/delete/link which are immediate)
watch(() => props.columns, (cols) => {
  if (open.value) {
    localColumns.value = [...cols]
    snapshotColumnOrder.value = cols.map(c => c.id)
  }
}, { immediate: true })

function onDragEnd() {
  // Just reorder locally — emitted on save
}

// ─── Board-mode: new column ───
const newColumnName = ref('')
const newColumnColor = ref('#6366f1')
const newColorOpen = ref(false)

function addBoardColumn() {
  if (!newColumnName.value.trim()) return
  emit('add', newColumnName.value.trim(), newColumnColor.value)
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

// Track which column's color popover is open
const colorPopoverOpen = ref<Record<string, boolean>>({})

function pickColor(colId: string, color: string) {
  colorPopoverOpen.value[colId] = false
  emit('update', colId, { color })
}

// ─── Tag filter toggle ───
function toggleTagFilter(tagId: string) {
  const next = new Set(localTagFilters.value)
  if (next.has(tagId)) {
    next.delete(tagId)
  } else {
    next.add(tagId)
  }
  localTagFilters.value = next
}

// ─── Dirty detection ───
const isDirty = computed(() => {
  if (editName.value.trim() !== snapshotName.value) return true
  const currentOrder = localColumns.value.map(c => c.id)
  if (currentOrder.length !== snapshotColumnOrder.value.length
    || currentOrder.some((id, i) => id !== snapshotColumnOrder.value[i])) return true
  const currentFilters = [...localTagFilters.value].sort()
  const prevFilters = [...snapshotTagFilters.value].sort()
  if (currentFilters.length !== prevFilters.length
    || currentFilters.some((id, i) => id !== prevFilters[i])) return true
  return false
})

// ─── Save — emit only what changed ───
function save() {
  if (!isDirty.value) {
    open.value = false
    return
  }

  const trimmedName = editName.value.trim()
  if (trimmedName && trimmedName !== snapshotName.value) {
    emit('rename', trimmedName)
  }

  const currentOrder = localColumns.value.map(c => c.id)
  const orderChanged = currentOrder.length !== snapshotColumnOrder.value.length
    || currentOrder.some((id, i) => id !== snapshotColumnOrder.value[i])
  if (orderChanged) {
    emit('reorder', localColumns.value.map((c, i) => ({ id: c.id, position: i })))
  }

  const currentFilters = [...localTagFilters.value].sort()
  const prevFilters = [...snapshotTagFilters.value].sort()
  const filtersChanged = currentFilters.length !== prevFilters.length
    || currentFilters.some((id, i) => id !== prevFilters[i])
  if (filtersChanged) {
    emit('update-tag-filters', [...localTagFilters.value])
  }

  open.value = false
}

const showCloseWarning = ref(false)

function close() {
  if (isDirty.value) {
    showCloseWarning.value = true
    return
  }
  open.value = false
}

function discardAndClose() {
  showCloseWarning.value = false
  open.value = false
}

// ─── Delete view — inline confirmation ───
const showDeleteConfirm = ref(false)
const deleteConfirmName = ref('')
const deletingView = ref(false)

const deleteConfirmValid = computed(() =>
  deleteConfirmName.value.trim() === (props.viewName || '').trim()
)

function handleDeleteView() {
  if (!deleteConfirmValid.value) return
  deletingView.value = true
  emit('delete-view')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="viewName !== undefined ? undefined : (mode === 'board' ? 'Board Settings' : 'List Settings')"
    :ui="viewName !== undefined ? { header: 'hidden', body: 'pt-0 sm:pt-0', footer: 'p-0 sm:p-0' } : { footer: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div class="flex flex-col gap-1">
        <!-- Editable name as title -->
        <template v-if="viewName !== undefined">
          <div class="pt-5 pb-1 px-1">
            <input
              v-model="editName"
              type="text"
              :placeholder="mode === 'board' ? 'Board name...' : 'List name...'"
              class="w-full text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-2 transition-colors"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            >
          </div>
        </template>

        <div class="flex items-center gap-1.5 mb-1">
          <UIcon
            name="i-lucide-columns-3"
            class="text-[13px] text-zinc-400 dark:text-zinc-500"
          />
          <span class="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em]">
            {{ mode === 'board' ? 'Columns' : 'Active Columns' }}
          </span>
        </div>
        <ClientOnly>
          <draggable
            v-model="localColumns"
            item-key="id"
            handle=".drag-handle"
            ghost-class="sortable-ghost"
            chosen-class="sortable-chosen"
            drag-class="sortable-drag"
            @end="onDragEnd"
          >
            <template #item="{ element: col }">
              <div
                class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <UIcon
                  name="i-lucide-grip-vertical"
                  class="drag-handle text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing text-[15px] shrink-0 transition-colors"
                />
                <!-- Board mode: color dot (editable if canAddColumns) -->
                <template v-if="mode === 'board'">
                  <UPopover
                    v-if="canAddColumns"
                    v-model:open="colorPopoverOpen[col.id]"
                  >
                    <button
                      type="button"
                      class="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
                      :style="{ backgroundColor: col.color || '#a1a1aa' }"
                    />
                    <template #content>
                      <div class="p-2">
                        <ColorPicker
                          :model-value="col.color || '#a1a1aa'"
                          @update:model-value="pickColor(col.id, $event)"
                        />
                      </div>
                    </template>
                  </UPopover>
                  <div
                    v-else
                    class="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                    :style="{ backgroundColor: col.color || '#a1a1aa' }"
                  />
                </template>
                <!-- List mode: field icon -->
                <UIcon
                  v-if="mode === 'list'"
                  :name="fieldIcon(col.field || '')"
                  class="text-[14px] text-zinc-400 dark:text-zinc-500 shrink-0"
                />
                <span class="text-[14px] font-medium flex-1">
                  {{ mode === 'board' ? col.name : fieldLabel(col.field || '') }}
                </span>
                <div class="flex items-center gap-0.5 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-opacity">
                  <UTooltip text="Remove column">
                    <UButton
                      icon="i-lucide-trash-2"
                      variant="ghost"
                      color="error"
                      size="xs"
                      @click="emit('delete', col.id)"
                    />
                  </UTooltip>
                </div>
              </div>
            </template>
          </draggable>
        </ClientOnly>

        <USeparator class="my-2" />

        <!-- Board mode: add new column -->
        <form
          v-if="mode === 'board' && canAddColumns"
          class="flex items-center gap-2"
          @submit.prevent="addBoardColumn"
        >
          <UPopover v-model:open="newColorOpen">
            <button
              type="button"
              class="w-5 h-5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
              :style="{ backgroundColor: newColumnColor }"
            />
            <template #content>
              <div class="p-2">
                <ColorPicker v-model="newColumnColor" />
              </div>
            </template>
          </UPopover>
          <UInput
            v-model="newColumnName"
            placeholder="New column name (project-wide)"
            class="flex-1"
            size="sm"
          />
          <UButton
            type="submit"
            icon="i-lucide-plus"
            label="Add"
            size="sm"
          />
        </form>

        <!-- Board mode: available columns to link -->
        <template v-if="mode === 'board' && availableColumns?.length">
          <USeparator class="my-2" />
          <div class="flex items-center gap-1.5 mb-1">
            <UIcon
              name="i-lucide-plus-circle"
              class="text-[13px] text-zinc-400 dark:text-zinc-500"
            />
            <span class="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em]">Available Columns</span>
          </div>
          <div
            v-for="col in availableColumns"
            :key="col.id"
            class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
          >
            <div
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: col.color || '#a1a1aa' }"
            />
            <span class="text-[14px] font-medium flex-1 text-zinc-400 dark:text-zinc-500">{{ col.name }}</span>
            <UButton
              icon="i-lucide-plus"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="emit('link', col.id)"
            />
          </div>
        </template>

        <!-- List mode: available fields -->
        <template v-if="mode === 'list' && availableFields.length">
          <div class="flex items-center gap-1.5 mb-1">
            <UIcon
              name="i-lucide-plus-circle"
              class="text-[13px] text-zinc-400 dark:text-zinc-500"
            />
            <span class="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em]">Available Fields</span>
          </div>
          <div
            v-for="f in availableFields"
            :key="f.field"
            class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
          >
            <UIcon
              :name="f.icon"
              class="text-[14px] text-zinc-300 dark:text-zinc-600 shrink-0"
            />
            <span class="text-[14px] font-medium flex-1 text-zinc-400 dark:text-zinc-500">{{ f.label }}</span>
            <UButton
              icon="i-lucide-plus"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="emit('add', f.field)"
            />
          </div>
        </template>

        <!-- Tag filters (shared) -->
        <template v-if="tags?.length">
          <USeparator class="my-2" />
          <div class="flex items-center gap-1.5 mb-1">
            <UIcon
              name="i-lucide-filter"
              class="text-[13px] text-zinc-400 dark:text-zinc-500"
            />
            <span class="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em]">Tag Filters</span>
            <span
              v-if="!localTagFilters.size"
              class="ml-auto text-[11px] text-zinc-300 dark:text-zinc-600 italic"
            >All cards shown</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in tags"
              :key="tag.id"
              type="button"
              class="tag-toggle inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold transition-all duration-150 active:scale-95"
              :class="localTagFilters.has(tag.id)
                ? ''
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 tag-toggle-inactive'"
              :style="localTagFilters.has(tag.id) ? {
                color: tag.color,
                backgroundColor: tag.color + '22',
                boxShadow: `inset 0 0 0 1.5px ${tag.color}`
              } : {}"
              @click="toggleTagFilter(tag.id)"
            >
              <UIcon
                :name="localTagFilters.has(tag.id) ? 'i-lucide-check' : 'i-lucide-circle'"
                class="text-[10px]"
                :style="localTagFilters.has(tag.id) ? {} : { color: tag.color }"
              />
              {{ tag.name }}
            </button>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <!-- Delete confirmation replaces footer -->
      <div
        v-if="showDeleteConfirm"
        class="px-5 pt-4 pb-5 border-t border-red-200/40 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10"
      >
        <p class="text-[13px] font-medium text-red-600 dark:text-red-400 mb-2">
          This will permanently delete this {{ viewType || 'view' }}. Type <span class="font-bold">{{ viewName }}</span> to confirm.
        </p>
        <div class="flex items-center gap-2">
          <input
            v-model="deleteConfirmName"
            type="text"
            :placeholder="viewName"
            class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
          >
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!deleteConfirmValid || deletingView"
            @click="handleDeleteView"
          >
            <UIcon
              v-if="!deletingView"
              name="i-lucide-trash-2"
              class="text-[13px]"
            />
            <UIcon
              v-else
              name="i-lucide-loader-2"
              class="text-[13px] animate-spin"
            />
            Delete
          </button>
          <button
            type="button"
            class="px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            @click="showDeleteConfirm = false; deleteConfirmName = ''"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Close warning replaces footer -->
      <div
        v-else-if="showCloseWarning"
        class="flex items-center justify-between px-5 pt-4 pb-5 border-t border-amber-200/40 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/10"
      >
        <p class="text-[13px] font-medium text-amber-600 dark:text-amber-400">
          Discard unsaved changes?
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            @click="showCloseWarning = false"
          >
            Keep editing
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all"
            @click="discardAndClose"
          >
            Discard
          </button>
        </div>
      </div>

      <!-- Normal footer -->
      <div
        v-else
        class="flex items-center justify-between px-5 pt-4 pb-5 border-t border-zinc-100 dark:border-zinc-700/40"
      >
        <div>
          <button
            v-if="viewName !== undefined"
            type="button"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            @click="showDeleteConfirm = true; deleteConfirmName = ''"
          >
            <UIcon
              name="i-lucide-trash-2"
              class="text-[13px]"
            />
            Delete
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            @click="close"
          >
            Close
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all"
            :class="isDirty
              ? 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25'
              : 'bg-zinc-300 dark:bg-zinc-700 cursor-default'"
            @click="save"
          >
            Save
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
