<script setup lang="ts">
interface BoardColumn {
  id: string
  name: string
  color?: string | null
}

interface BoardCard {
  id: number
  title: string
  description?: string | null
  priority: string
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  tags?: Array<{ id: string, name: string, color: string }>
  attachmentCount?: number
  dueDate?: string | null
}

interface BoardMember {
  id: string
  name: string
  avatarUrl: string | null
}

const _props = defineProps<{
  columns: BoardColumn[]
  cardsByColumn: Record<string, BoardCard[]>
  projectKey?: string
  projectSlug?: string
  doneStatusId?: string | null
  canConfigureColumns?: boolean
  canAddColumns?: boolean
  availableColumns?: BoardColumn[]
  members?: BoardMember[]
}>()

const emit = defineEmits<{
  'card-click': [card: BoardCard]
  'card-moved': [cardId: number, toColumnId: string, toPosition: number]
  'card-update': [cardId: number, updates: Record<string, unknown>]
  'add-card': [columnId: string]
  'add-column': [name: string, color?: string]
  'link-column': [columnId: string]
}>()

function handleCardChange(columnId: string, evt: { added?: { element: { id: number }, newIndex: number }, moved?: { element: { id: number }, newIndex: number } }) {
  if (evt.added) {
    emit('card-moved', evt.added.element.id, columnId, evt.added.newIndex)
  } else if (evt.moved) {
    emit('card-moved', evt.moved.element.id, columnId, evt.moved.newIndex)
  }
}

const showAddColumn = ref(false)
const mode = ref<'pick' | 'create'>('pick')
const newColumnName = ref('')
const newColumnColor = ref('#6366f1')
const newColorOpen = ref(false)
const nameInput = ref<HTMLInputElement>()

function openAddColumn() {
  showAddColumn.value = true
  mode.value = 'pick'
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

function switchToCreate() {
  mode.value = 'create'
  nextTick(() => nameInput.value?.focus())
}

function linkExisting(columnId: string) {
  emit('link-column', columnId)
  showAddColumn.value = false
}

function submitColumn() {
  if (!newColumnName.value.trim()) return
  emit('add-column', newColumnName.value.trim(), newColumnColor.value)
  showAddColumn.value = false
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

function cancelAddColumn() {
  showAddColumn.value = false
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}
</script>

<template>
  <div class="flex gap-3 overflow-x-auto px-5 py-4 flex-1 min-h-0 kanban-scroll">
    <KanbanColumn
      v-for="column in columns"
      :key="column.id"
      :column="column"
      :cards="cardsByColumn[column.id] || []"
      :accent-color="column.color || '#a1a1aa'"
      :is-done="column.id === doneStatusId"
      :project-key="projectKey"
      :project-slug="projectSlug"
      :members="members"
      @card-click="(card) => emit('card-click', card)"
      @card-change="(evt) => handleCardChange(column.id, evt)"
      @card-update="(cardId, updates) => emit('card-update', cardId, updates)"
      @add-card="emit('add-card', column.id)"
    />

    <!-- Add column -->
    <div
      v-if="canConfigureColumns"
      class="shrink-0 w-[280px]"
    >
      <button
        v-if="!showAddColumn"
        class="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200/70 dark:border-zinc-700/50 py-10 text-[13px] font-medium text-zinc-400 dark:text-zinc-500 hover:border-indigo-300 hover:text-indigo-500 dark:hover:border-indigo-500/50 dark:hover:text-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-all"
        @click="openAddColumn"
      >
        <UIcon
          name="i-lucide-plus"
          class="text-base"
        />
        Add column
      </button>

      <!-- Pick / Create panel -->
      <div
        v-else
        class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 p-3 flex flex-col gap-2 shadow-sm"
      >
        <!-- Pick from available columns -->
        <template v-if="mode === 'pick'">
          <div
            v-if="availableColumns?.length"
            class="flex flex-col gap-1"
          >
            <span class="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.06em] mb-0.5">Available columns</span>
            <button
              v-for="col in availableColumns"
              :key="col.id"
              type="button"
              class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors text-left"
              @click="linkExisting(col.id)"
            >
              <div
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: col.color || '#a1a1aa' }"
              />
              {{ col.name }}
            </button>
          </div>
          <div
            v-else
            class="text-[13px] text-zinc-400 dark:text-zinc-500 py-2 text-center"
          >
            No unlinked columns available
          </div>

          <template v-if="canAddColumns">
            <div
              v-if="availableColumns?.length"
              class="border-t border-zinc-200/80 dark:border-zinc-700/50 my-0.5"
            />
            <button
              type="button"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors"
              @click="switchToCreate"
            >
              <UIcon
                name="i-lucide-plus"
                class="text-sm"
              />
              Create new column <span class="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">(project-wide)</span>
            </button>
          </template>

          <div class="flex justify-end pt-0.5">
            <button
              type="button"
              class="px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
              @click="cancelAddColumn"
            >
              Cancel
            </button>
          </div>
        </template>

        <!-- Create new column form (project owner/admin only) -->
        <form
          v-else
          @submit.prevent="submitColumn"
        >
          <div class="flex flex-col gap-2.5">
            <button
              type="button"
              class="flex items-center gap-1 text-[12px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors self-start"
              @click="mode = 'pick'"
            >
              <UIcon
                name="i-lucide-arrow-left"
                class="text-[12px]"
              />
              Back
            </button>
            <input
              ref="nameInput"
              v-model="newColumnName"
              type="text"
              placeholder="Column name"
              class="w-full text-[14px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors"
              @keydown.escape="cancelAddColumn"
            >
            <div class="flex items-center gap-2">
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
              <span class="text-[12px] text-zinc-400 dark:text-zinc-500">Color</span>
              <div class="flex-1" />
              <button
                type="button"
                class="px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                @click="cancelAddColumn"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!newColumnName.trim()"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="text-[12px]"
                />
                Add
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
