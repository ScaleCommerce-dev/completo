<script setup lang="ts">
interface Status {
  id: string
  name: string
  color: string | null
}

interface Tag {
  id: string
  name: string
  color: string
}

const props = defineProps<{
  projectId: string
  projectName: string
  projectSlug: string
  statuses: Status[]
  tags: Tag[]
}>()

const emit = defineEmits<{
  created: [view: { type: 'board' | 'list', slug: string }]
}>()

const open = defineModel<boolean>('open', { default: false })

const LIST_FIELD_OPTIONS = [
  { field: 'ticketId', label: 'Ticket ID' },
  { field: 'title', label: 'Title' },
  { field: 'status', label: 'Status' },
  { field: 'priority', label: 'Priority' },
  { field: 'assignee', label: 'Assignee' },
  { field: 'tags', label: 'Tags' },
  { field: 'dueDate', label: 'Due Date' },
  { field: 'createdAt', label: 'Created' },
  { field: 'updatedAt', label: 'Updated' },
  { field: 'description', label: 'Description' }
]
const DEFAULT_LIST_FIELDS = ['ticketId', 'title', 'status', 'priority', 'assignee', 'dueDate', 'tags']

const viewStep = ref<1 | 2 | 3>(1)
const viewType = ref<'board' | 'list'>('board')
const viewName = ref('')
const viewSlug = ref('')
const viewSlugManuallyEdited = ref(false)
const creatingView = ref(false)
const createError = ref('')
const selectedBoardColumns = ref<Set<string>>(new Set())
const selectedListFields = ref<Set<string>>(new Set(DEFAULT_LIST_FIELDS))
const selectedTagFilters = ref<Set<string>>(new Set())

const slugValid = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(viewSlug.value))
const slugAvailable = ref<boolean | null>(null)
const slugChecking = ref(false)
let slugCheckTimeout: ReturnType<typeof setTimeout> | null = null

watch(viewName, (val) => {
  if (!viewSlugManuallyEdited.value) {
    viewSlug.value = generateSlug(val)
  }
})

watch(viewSlug, (val) => {
  slugAvailable.value = null
  if (slugCheckTimeout) clearTimeout(slugCheckTimeout)
  if (!val || !slugValid.value) return
  slugChecking.value = true
  const checkEndpoint = viewType.value === 'board' ? '/api/boards/check-slug' : '/api/lists/check-slug'
  slugCheckTimeout = setTimeout(async () => {
    try {
      const { available } = await $fetch<{ available: boolean }>(checkEndpoint, {
        params: { slug: val, projectId: props.projectId }
      })
      if (viewSlug.value === val) {
        slugAvailable.value = available
      }
    } catch {
      slugAvailable.value = null
    } finally {
      slugChecking.value = false
    }
  }, 300)
})

function resetForm() {
  viewStep.value = 1
  viewType.value = 'board'
  viewName.value = ''
  viewSlug.value = ''
  viewSlugManuallyEdited.value = false
  createError.value = ''
  slugAvailable.value = null
  selectedBoardColumns.value = new Set(props.statuses.map(s => s.id))
  selectedListFields.value = new Set(DEFAULT_LIST_FIELDS)
  selectedTagFilters.value = new Set()
}

watch(open, (val) => {
  if (val) {
    resetForm()
    document.addEventListener('keydown', handleKeydown, true)
  } else {
    document.removeEventListener('keydown', handleKeydown, true)
  }
})

function onSlugInput(e: Event) {
  const input = e.target as HTMLInputElement
  input.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-')
  viewSlug.value = input.value
  viewSlugManuallyEdited.value = true
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    e.stopImmediatePropagation()
    if (viewStep.value === 3) createView()
    else if (viewStep.value === 2 && viewName.value.trim() && slugValid.value && slugAvailable.value !== false) viewStep.value = 3
  }
}

function selectViewType(type: 'board' | 'list') {
  viewType.value = type
  viewStep.value = 2
}

function goToStep3() {
  if (!viewName.value.trim() || !slugValid.value || slugAvailable.value === false) return
  selectedBoardColumns.value = new Set(props.statuses.map(s => s.id))
  viewStep.value = 3
}

function toggleBoardColumn(statusId: string) {
  const next = new Set(selectedBoardColumns.value)
  if (next.has(statusId)) {
    if (next.size > 1) next.delete(statusId)
  } else {
    next.add(statusId)
  }
  selectedBoardColumns.value = next
}

function toggleListField(field: string) {
  const next = new Set(selectedListFields.value)
  if (next.has(field)) {
    if (next.size > 1) next.delete(field)
  } else {
    next.add(field)
  }
  selectedListFields.value = next
}

function toggleCreateTagFilter(tagId: string) {
  const next = new Set(selectedTagFilters.value)
  if (next.has(tagId)) {
    next.delete(tagId)
  } else {
    next.add(tagId)
  }
  selectedTagFilters.value = next
}

async function createView() {
  if (!viewName.value.trim() || !slugValid.value || slugAvailable.value === false) return
  creatingView.value = true
  createError.value = ''
  try {
    if (viewType.value === 'board') {
      const board = await $fetch(`/api/projects/${props.projectId}/boards`, {
        method: 'POST',
        body: {
          name: viewName.value,
          slug: viewSlug.value,
          columns: [...selectedBoardColumns.value],
          tagFilters: [...selectedTagFilters.value]
        }
      }) as { slug: string }
      open.value = false
      emit('created', { type: 'board', slug: board.slug })
    } else {
      const list = await $fetch(`/api/projects/${props.projectId}/lists`, {
        method: 'POST',
        body: {
          name: viewName.value,
          slug: viewSlug.value,
          columns: [...selectedListFields.value],
          tagFilters: [...selectedTagFilters.value]
        }
      }) as { slug: string }
      open.value = false
      emit('created', { type: 'list', slug: list.slug })
    }
  } catch (e: unknown) {
    createError.value = getErrorMessage(e, 'Failed to create view')
  } finally {
    creatingView.value = false
  }
}

onUnmounted(() => document.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div
        class="rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 px-5 pt-5 pb-2">
          <div class="flex items-center justify-center w-8 h-8 rounded-[8px] bg-indigo-500/10 dark:bg-indigo-500/15">
            <UIcon :name="viewStep === 1 ? 'i-lucide-layout-grid' : viewType === 'board' ? 'i-lucide-layout-dashboard' : 'i-lucide-list'" class="text-[15px] text-indigo-500" />
          </div>
          <div>
            <h2 class="text-[14px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
              {{ viewStep === 1 ? 'New View' : viewStep === 2 ? `New ${viewType === 'board' ? 'Board' : 'List'}` : 'Configure Columns' }}
            </h2>
            <p class="text-[12px] text-zinc-400 dark:text-zinc-500">
              {{ viewStep === 1 ? 'Choose a view type' : viewStep === 2 ? `Add a ${viewType} to ${projectName}` : 'Configure view' }}
            </p>
          </div>
        </div>

        <!-- Step 1: Pick type -->
        <div v-if="viewStep === 1" class="px-5 py-4">
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              class="rounded-xl border-2 p-4 text-left transition-all hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5 border-zinc-200/80 dark:border-zinc-700/70"
              @click="selectViewType('board')"
            >
              <div class="flex items-center gap-3 mb-2">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500">
                  <UIcon name="i-lucide-layout-dashboard" class="text-xl" />
                </div>
                <span class="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Board</span>
              </div>
              <p class="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Kanban board with cards grouped by status columns
              </p>
            </button>
            <button
              type="button"
              class="rounded-xl border-2 p-4 text-left transition-all hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5 border-zinc-200/80 dark:border-zinc-700/70"
              @click="selectViewType('list')"
            >
              <div class="flex items-center gap-3 mb-2">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-500">
                  <UIcon name="i-lucide-list" class="text-xl" />
                </div>
                <span class="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">List</span>
              </div>
              <p class="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Table view showing all cards with configurable columns
              </p>
            </button>
          </div>
        </div>

        <!-- Step 2: Name + slug -->
        <form v-if="viewStep === 2" @submit.prevent="goToStep3">
          <div class="px-5 pt-2 pb-1">
            <input
              v-model="viewName"
              type="text"
              :placeholder="`${viewType === 'board' ? 'Board' : 'List'} name...`"
              autofocus
              class="w-full text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-2 transition-colors"
            />
          </div>

          <div class="mx-5 mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700/60 divide-y divide-zinc-100 dark:divide-zinc-700/40 overflow-hidden">
            <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
              <div class="flex items-center gap-2 w-28 shrink-0">
                <UIcon name="i-lucide-link" class="text-sm text-zinc-400" />
                <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Slug</span>
              </div>
              <div class="flex-1 flex items-center gap-2.5">
                <input
                  :value="viewSlug"
                  type="text"
                  placeholder="my-view"
                  class="flex-1 text-[14px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0! tracking-wide"
                  @input="onSlugInput"
                />
                <UIcon v-if="slugChecking" name="i-lucide-loader-2" class="text-[14px] text-zinc-400 animate-spin shrink-0" />
                <UIcon v-else-if="viewSlug && slugAvailable === true" name="i-lucide-check" class="text-[14px] text-emerald-500 shrink-0" />
                <UIcon v-else-if="viewSlug && slugAvailable === false" name="i-lucide-x" class="text-[14px] text-red-500 shrink-0" />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between px-5 pt-4 pb-5 mt-4 border-t border-zinc-100 dark:border-zinc-700/40">
            <div class="flex items-center gap-1.5">
              <span v-if="viewSlug && slugAvailable === false" class="text-[12px] font-medium text-red-500 dark:text-red-400">Slug already taken</span>
              <span v-else-if="viewSlug && slugValid && slugAvailable === true" class="flex items-center gap-1 text-[12px] font-medium text-emerald-500 dark:text-emerald-400">
                <UIcon name="i-lucide-check" class="text-[12px]" />
                {{ viewSlug }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" @click="viewStep = 1">
                Back
              </button>
              <button
                type="submit"
                class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!viewName.trim() || !slugValid || slugAvailable === false"
              >
                Next
                <UIcon name="i-lucide-arrow-right" class="text-[14px]" />
              </button>
            </div>
          </div>
        </form>

        <!-- Step 3: Configure columns -->
        <div v-if="viewStep === 3">
          <div class="px-5 py-4 max-h-[320px] overflow-y-auto">
            <!-- Board: checkbox statuses -->
            <template v-if="viewType === 'board'">
              <div
                v-for="status in statuses"
                :key="status.id"
                class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                @click="toggleBoardColumn(status.id)"
              >
                <div
                  class="flex items-center justify-center w-5 h-5 rounded border-2 transition-all shrink-0"
                  :class="selectedBoardColumns.has(status.id)
                    ? 'bg-indigo-500 border-indigo-500'
                    : 'border-zinc-300 dark:border-zinc-600'"
                >
                  <UIcon v-if="selectedBoardColumns.has(status.id)" name="i-lucide-check" class="text-white text-[12px]" />
                </div>
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: status.color || '#a1a1aa' }"
                />
                <span class="text-[14px] font-medium text-zinc-700 dark:text-zinc-300">{{ status.name }}</span>
              </div>
            </template>

            <!-- List: checkbox fields -->
            <template v-else>
              <div
                v-for="f in LIST_FIELD_OPTIONS"
                :key="f.field"
                class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                @click="toggleListField(f.field)"
              >
                <div
                  class="flex items-center justify-center w-5 h-5 rounded border-2 transition-all shrink-0"
                  :class="selectedListFields.has(f.field)
                    ? 'bg-indigo-500 border-indigo-500'
                    : 'border-zinc-300 dark:border-zinc-600'"
                >
                  <UIcon v-if="selectedListFields.has(f.field)" name="i-lucide-check" class="text-white text-[12px]" />
                </div>
                <span class="text-[14px] font-medium text-zinc-700 dark:text-zinc-300">{{ f.label }}</span>
              </div>
            </template>

            <!-- Tag filters (both board and list) -->
            <template v-if="tags.length">
              <div class="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-700/40">
                <div class="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em] mb-2">Tag Filters</div>
                <p class="text-[12px] text-zinc-400 dark:text-zinc-500 mb-2">Only show cards matching selected tags</p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="tag in tags"
                    :key="tag.id"
                    type="button"
                    class="tag-toggle inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold transition-all duration-150 active:scale-95"
                    :class="selectedTagFilters.has(tag.id)
                      ? ''
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 tag-toggle-inactive'"
                    :style="selectedTagFilters.has(tag.id) ? {
                      color: tag.color,
                      backgroundColor: tag.color + '22',
                      boxShadow: `inset 0 0 0 1.5px ${tag.color}`
                    } : {}"
                    @click="toggleCreateTagFilter(tag.id)"
                  >
                    <UIcon
                      :name="selectedTagFilters.has(tag.id) ? 'i-lucide-check' : 'i-lucide-circle'"
                      class="text-[10px]"
                      :style="selectedTagFilters.has(tag.id) ? {} : { color: tag.color }"
                    />
                    {{ tag.name }}
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- Error -->
          <div v-if="createError" class="mx-5 mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
            <UIcon name="i-lucide-alert-circle" class="text-[14px] text-red-500 shrink-0" />
            <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ createError }}</span>
          </div>

          <div class="flex items-center justify-between px-5 pt-4 pb-5 border-t border-zinc-100 dark:border-zinc-700/40">
            <span class="text-[12px] text-zinc-400 dark:text-zinc-500">
              {{ viewType === 'board' ? `${selectedBoardColumns.size} statuses` : `${selectedListFields.size} fields` }}{{ selectedTagFilters.size ? `, ${selectedTagFilters.size} tag filter${selectedTagFilters.size > 1 ? 's' : ''}` : '' }}
            </span>
            <div class="flex items-center gap-2">
              <button type="button" class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" @click="viewStep = 2">
                Back
              </button>
              <span class="text-[10px] font-mono text-zinc-300 dark:text-zinc-600 hidden sm:block">
                <kbd class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500">&#8984;&#x23CE;</kbd>
              </span>
              <button
                type="button"
                class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="creatingView"
                @click="createView"
              >
                <UIcon v-if="!creatingView" name="i-lucide-plus" class="text-[14px]" />
                <UIcon v-else name="i-lucide-loader-2" class="text-[14px] animate-spin" />
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
