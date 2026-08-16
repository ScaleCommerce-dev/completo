<script setup lang="ts">
// Explicit import: shared/utils is auto-imported for Nitro but not into app components.
import { LIST_FIELDS, LIST_DEFAULT_FIELDS } from '#shared/utils/list-fields'

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

// Both pickers offer the same fields, from shared/utils/list-fields.ts. This list used to
// omit `done`, so the checkbox column could only be added after the list existed.
const LIST_FIELD_OPTIONS = LIST_FIELDS
const DEFAULT_LIST_FIELDS = LIST_DEFAULT_FIELDS

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
        class="rounded-xl bg-default overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 px-5 pt-5 pb-2">
          <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <UIcon
              :name="viewStep === 1 ? 'i-lucide-layout-grid' : viewType === 'board' ? 'i-lucide-layout-dashboard' : 'i-lucide-list'"
              class="text-base text-primary"
            />
          </div>
          <div>
            <h2 class="text-base font-bold tracking-heading text-highlighted">
              {{ viewStep === 1 ? 'New View' : viewStep === 2 ? `New ${viewType === 'board' ? 'Board' : 'List'}` : 'Configure Columns' }}
            </h2>
            <p class="text-xs text-dimmed">
              {{ viewStep === 1 ? 'Choose a view type' : viewStep === 2 ? `Add a ${viewType} to ${projectName}` : 'Configure view' }}
            </p>
          </div>
        </div>

        <!-- Step 1: Pick type -->
        <div
          v-if="viewStep === 1"
          class="px-5 py-4"
        >
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              class="rounded-xl border-2 p-4 text-left transition-colors hover:border-primary/60 hover:shadow-float border-default"
              @click="selectViewType('board')"
            >
              <div class="flex items-center gap-3 mb-2">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                  <UIcon
                    name="i-lucide-layout-dashboard"
                    class="text-xl"
                  />
                </div>
                <span class="text-base font-bold text-highlighted">Board</span>
              </div>
              <p class="text-xs text-muted leading-relaxed">
                Kanban board with cards grouped by status columns
              </p>
            </button>
            <button
              type="button"
              class="rounded-xl border-2 p-4 text-left transition-colors hover:border-primary/60 hover:shadow-float border-default"
              @click="selectViewType('list')"
            >
              <div class="flex items-center gap-3 mb-2">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/10 text-secondary">
                  <UIcon
                    name="i-lucide-list"
                    class="text-xl"
                  />
                </div>
                <span class="text-base font-bold text-highlighted">List</span>
              </div>
              <p class="text-xs text-muted leading-relaxed">
                Table view showing all cards with configurable columns
              </p>
            </button>
          </div>
        </div>

        <!-- Step 2: Name + slug -->
        <form
          v-if="viewStep === 2"
          @submit.prevent="goToStep3"
        >
          <div class="px-5 pt-2 pb-1">
            <input
              v-model="viewName"
              type="text"
              :aria-label="`${viewType === 'board' ? 'Board' : 'List'} name`"
              :placeholder="`${viewType === 'board' ? 'Board' : 'List'} name...`"
              autofocus
              class="w-full text-lg font-semibold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent rounded-none tracking-name leading-snug py-2 transition-colors"
            >
          </div>

          <div class="mx-5 mt-4 rounded-lg border border-accented divide-y divide-default overflow-hidden">
            <div class="flex items-center px-3 py-2.5 bg-default border-b border-transparent focus-within:border-primary">
              <div class="flex items-center gap-2 w-28 shrink-0">
                <UIcon
                  name="i-lucide-link"
                  class="text-sm text-dimmed"
                />
                <span class="text-sm font-medium text-muted">Slug</span>
              </div>
              <div class="flex-1 flex items-center gap-2.5">
                <input
                  :value="viewSlug"
                  type="text"
                  aria-label="URL slug"
                  placeholder="my-view"
                  class="flex-1 min-w-0 text-base font-medium text-highlighted placeholder:text-dimmed bg-transparent border-0 tracking-wide"
                  @input="onSlugInput"
                >
                <UIcon
                  v-if="slugChecking"
                  name="i-lucide-loader-2"
                  class="text-base text-dimmed animate-spin shrink-0"
                />
                <UIcon
                  v-else-if="viewSlug && slugAvailable === true"
                  name="i-lucide-check"
                  class="text-base text-success shrink-0"
                />
                <UIcon
                  v-else-if="viewSlug && slugAvailable === false"
                  name="i-lucide-x"
                  class="text-base text-error shrink-0"
                />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between px-5 pt-4 pb-5 mt-4 border-t border-muted">
            <div class="flex items-center gap-1.5">
              <span
                v-if="viewSlug && slugAvailable === false"
                class="text-xs font-medium text-error"
              >Slug already taken</span>
              <span
                v-else-if="viewSlug && slugValid && slugAvailable === true"
                class="flex items-center gap-1 text-xs font-medium text-success"
              >
                <UIcon
                  name="i-lucide-check"
                  class="text-xs"
                />
                {{ viewSlug }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex items-center px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
                @click="viewStep = 1"
              >
                Back
              </button>
              <UButton
                type="submit"
                label="Next"
                trailing-icon="i-lucide-arrow-right"
                :disabled="!viewName.trim() || !slugValid || slugAvailable === false"
              />
            </div>
          </div>
        </form>

        <!-- Step 3: Configure columns -->
        <div v-if="viewStep === 3">
          <div class="px-5 py-4 max-h-[320px] overflow-y-auto">
            <!-- Board: checkbox statuses -->
            <template v-if="viewType === 'board'">
              <!--
                A real control, not a clickable div. These rows are checkboxes in
                everything but markup — they carry a checked state and toggle it —
                so `role="checkbox"` with `aria-checked` is what makes the state
                announced and the row reachable. The tag chips further down were
                already buttons; these were the odd ones out, and a keyboard could
                not choose a single column for a new board.
              -->
              <button
                v-for="status in statuses"
                :key="status.id"
                type="button"
                role="checkbox"
                :aria-checked="selectedBoardColumns.has(status.id)"
                class="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                @click="toggleBoardColumn(status.id)"
              >
                <div
                  class="flex items-center justify-center w-5 h-5 rounded-md border-2 transition-colors shrink-0"
                  :class="selectedBoardColumns.has(status.id)
                    ? 'bg-primary border-primary'
                    : 'border-accented'"
                >
                  <UIcon
                    v-if="selectedBoardColumns.has(status.id)"
                    name="i-lucide-check"
                    class="text-white text-xs"
                  />
                </div>
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: status.color || '#a1a1aa' }"
                />
                <span class="text-base font-medium text-default">{{ status.name }}</span>
              </button>
            </template>

            <!-- List: checkbox fields -->
            <template v-else>
              <button
                v-for="f in LIST_FIELD_OPTIONS"
                :key="f.field"
                type="button"
                role="checkbox"
                :aria-checked="selectedListFields.has(f.field)"
                class="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                @click="toggleListField(f.field)"
              >
                <div
                  class="flex items-center justify-center w-5 h-5 rounded-md border-2 transition-colors shrink-0"
                  :class="selectedListFields.has(f.field)
                    ? 'bg-primary border-primary'
                    : 'border-accented'"
                >
                  <UIcon
                    v-if="selectedListFields.has(f.field)"
                    name="i-lucide-check"
                    class="text-white text-xs"
                  />
                </div>
                <span class="text-base font-medium text-default">{{ f.label }}</span>
              </button>
            </template>

            <!-- Tag filters (both board and list) -->
            <template v-if="tags.length">
              <div class="mt-3 pt-3 border-t border-muted">
                <div class="text-xs font-bold text-muted uppercase tracking-label mb-2">
                  Tag Filters
                </div>
                <p class="text-xs text-dimmed mb-2">
                  Only show cards matching selected tags
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="tag in tags"
                    :key="tag.id"
                    type="button"
                    class="tag-toggle inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition duration-150 active:scale-95"
                    :class="selectedTagFilters.has(tag.id)
                      ? ''
                      : 'bg-elevated text-dimmed hover:text-toned tag-toggle-inactive'"
                    :style="selectedTagFilters.has(tag.id) ? {
                      color: tag.color,
                      backgroundColor: tag.color + '22',
                      boxShadow: `inset 0 0 0 1.5px ${tag.color}`
                    } : {}"
                    @click="toggleCreateTagFilter(tag.id)"
                  >
                    <UIcon
                      :name="selectedTagFilters.has(tag.id) ? 'i-lucide-check' : 'i-lucide-circle'"
                      class="text-2xs"
                      :style="selectedTagFilters.has(tag.id) ? {} : { color: tag.color }"
                    />
                    {{ tag.name }}
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- Error -->
          <UAlert
            v-if="createError"
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            :description="createError"
            class="mx-5 mt-1"
          />

          <div class="flex items-center justify-between px-5 pt-4 pb-5 border-t border-muted">
            <span class="text-xs text-dimmed">
              {{ viewType === 'board' ? `${selectedBoardColumns.size} statuses` : `${selectedListFields.size} fields` }}{{ selectedTagFilters.size ? `, ${selectedTagFilters.size} tag filter${selectedTagFilters.size > 1 ? 's' : ''}` : '' }}
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex items-center px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
                @click="viewStep = 2"
              >
                Back
              </button>
              <!-- The shortcut belongs on the button it triggers, not floating
                   beside it. There were three spellings of this hint. -->
              <UButton
                label="Create"
                icon="i-lucide-plus"
                :loading="creatingView"
                @click="createView"
              >
                <template #trailing>
                  <UiKey value="meta" />
                  <UiKey value="enter" />
                </template>
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
