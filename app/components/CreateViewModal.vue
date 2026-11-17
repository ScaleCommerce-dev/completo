<script setup lang="ts">
import { isValidSlug } from '#shared/utils/slug'
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

const slugValid = computed(() => isValidSlug(viewSlug.value))
// The shared check: it aborts a superseded request, so an emptied slug or a switch
// between board and list (two endpoints) never leaves a spinner or a stale answer.
const slugCheck = useAvailabilityCheck({
  endpoint: () => viewType.value === 'board' ? '/api/boards/check-slug' : '/api/lists/check-slug',
  paramName: 'slug',
  validate: isValidSlug,
  params: () => ({ projectId: props.projectId })
})
const slugAvailable = slugCheck.available
const slugChecking = slugCheck.checking
onBeforeUnmount(slugCheck.cleanup)

watch(viewName, (val) => {
  if (!viewSlugManuallyEdited.value) {
    viewSlug.value = generateSlug(val)
  }
})

watch([viewSlug, viewType], ([slug]) => slugCheck.check(slug))

function resetForm() {
  viewStep.value = 1
  viewType.value = 'board'
  viewName.value = ''
  viewSlug.value = ''
  viewSlugManuallyEdited.value = false
  createError.value = ''
  slugCheck.reset()
  selectedBoardColumns.value = new Set(props.statuses.map(s => s.id))
  selectedListFields.value = new Set(DEFAULT_LIST_FIELDS)
  selectedTagFilters.value = new Set()
}

watch(open, (val) => {
  if (val) resetForm()
})

function onSlugInput(e: Event) {
  const input = e.target as HTMLInputElement
  input.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-')
  viewSlug.value = input.value
  viewSlugManuallyEdited.value = true
}

useCmdEnter(() => {
  if (viewStep.value === 3) createView()
  else if (viewStep.value === 2 && viewName.value.trim() && slugValid.value && slugAvailable.value !== false) viewStep.value = 3
}, { active: () => open.value })

/** The footer's summary line: what this view will contain, before it exists. */
const selectionSummary = computed(() => {
  const base = viewType.value === 'board'
    ? `${selectedBoardColumns.value.size} statuses`
    : `${selectedListFields.value.size} fields`
  const tags = selectedTagFilters.value.size
  return tags ? `${base}, ${tags} tag filter${tags > 1 ? 's' : ''}` : base
})

function selectViewType(type: 'board' | 'list') {
  viewType.value = type
  viewStep.value = 2
}

function goToStep3() {
  if (!viewName.value.trim() || !slugValid.value || slugAvailable.value === false) return
  // Filled here only when nothing is chosen yet (the statuses can arrive after the
  // dialog opens). Refilling every time re-ticked what the user had unticked
  // whenever they went Back and Next again, while ⌘↵ kept their choice.
  if (!selectedBoardColumns.value.size) selectedBoardColumns.value = new Set(props.statuses.map(s => s.id))
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
  if (creatingView.value) return
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

/**
 * The dialog's own header, per step.
 *
 * It was a hand-built icon + title + subtitle row inside a `#content` override,
 * which is how the wizard ended up with no accessible name at all — `UiModal`
 * announces the title, so the header has to be props rather than markup. The glyph
 * follows the choice you have made: the generic grid while you are still choosing,
 * then the board's or the list's own glyph, which is the same one its card in the
 * project's view list carries.
 */
const STEP_HEADINGS = computed(() => {
  const kind = viewType.value === 'board' ? 'board' : 'list'

  return {
    1: {
      icon: 'i-lucide-layout-grid',
      title: 'New view',
      description: `Two ways to look at ${props.projectName}'s cards`
    },
    2: {
      icon: viewType.value === 'board' ? 'i-lucide-layout-dashboard' : 'i-lucide-list',
      title: `New ${kind}`,
      description: 'Name it, and pick the address it lives at'
    },
    3: {
      icon: viewType.value === 'board' ? 'i-lucide-layout-dashboard' : 'i-lucide-list',
      title: 'Choose what it shows',
      description: viewType.value === 'board'
        ? 'Statuses become columns. You can add and remove them later.'
        : 'Fields become table columns. You can add and remove them later.'
    }
  }[viewStep.value]
})
</script>

<template>
  <!--
    `flush`, and no `#footer`: each step carries its own action row inside the
    body, because step 2's Next is `type="submit"` on a form in the body — Enter in
    the name field has to submit it, and a button in the modal's footer sits
    outside that form where it would submit nothing.
  -->
  <UiModal
    v-model:open="open"
    :icon="STEP_HEADINGS.icon"
    tone="primary"
    :title="STEP_HEADINGS.title"
    :description="STEP_HEADINGS.description"
    flush
  >
    <template #body>
      <!-- Step 1: Pick type -->
      <div
        v-if="viewStep === 1"
        class="px-dialog pt-4 pb-dialog"
      >
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            class="rounded-xl border border-default p-4 text-left transition-colors hover:border-accent hover:bg-action-hover"
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
            class="rounded-xl border border-default p-4 text-left transition-colors hover:border-accent hover:bg-action-hover"
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
        <div class="px-dialog pt-2 pb-1">
          <UInput
            v-model="viewName"
            :aria-label="`${viewType === 'board' ? 'Board' : 'List'} name`"
            :placeholder="`${viewType === 'board' ? 'Board' : 'List'} name...`"
            autofocus
            class="w-full"
            :ui="{ base: 'font-semibold text-highlighted' }"
          />
        </div>

        <div class="mx-dialog mt-4 rounded-lg border border-default divide-y divide-default overflow-hidden">
          <div
            data-focus-field="inset"
            class="flex items-center px-3 py-2.5 bg-default border-b border-transparent"
          >
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

        <div class="flex items-center justify-between px-dialog pt-4 pb-7 mt-4">
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
            <UButton
              label="Back"
              variant="ghost"
              color="neutral"
              @click="viewStep = 1"
            />
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
        <div class="px-dialog py-4 max-h-[320px] overflow-y-auto">
          <!-- Board: checkbox statuses -->
          <template v-if="viewType === 'board'">
            <!-- `UCheckbox`, not a hand-drawn box: it is keyboard-operable and
                 announced as a checkbox, and its fill is the theme's accent rather
                 than a `bg-primary` square (the text-safe tint, not the fill). -->
            <UCheckbox
              v-for="status in statuses"
              :key="status.id"
              :model-value="selectedBoardColumns.has(status.id)"
              class="px-2 py-2 rounded-lg hover:bg-muted transition-colors"
              :ui="{ label: 'flex items-center gap-3 text-base font-medium text-default' }"
              @update:model-value="toggleBoardColumn(status.id)"
            >
              <template #label>
                <UiStatusDot :color="status.color" />
                {{ status.name }}
              </template>
            </UCheckbox>
          </template>

          <!-- List: checkbox fields -->
          <template v-else>
            <UCheckbox
              v-for="f in LIST_FIELD_OPTIONS"
              :key="f.field"
              :model-value="selectedListFields.has(f.field)"
              :label="f.label"
              class="px-2 py-2 rounded-lg hover:bg-muted transition-colors"
              :ui="{ label: 'text-base font-medium text-default' }"
              @update:model-value="toggleListField(f.field)"
            />
          </template>

          <!-- Tag filters (both board and list) -->
          <template v-if="tags.length">
            <div class="mt-3 pt-3 border-t border-muted">
              <UiSectionLabel
                label="Tag Filters"
                class="mb-2"
              />
              <p class="text-xs text-dimmed mb-2">
                Only show cards matching selected tags
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="tag in tags"
                  :key="tag.id"
                  type="button"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition duration-150 active:scale-95"
                  :class="selectedTagFilters.has(tag.id)
                    ? 'swatch'
                    : 'bg-elevated text-dimmed hover:text-toned'"
                  :style="selectedTagFilters.has(tag.id) ? { '--swatch': tag.color } : {}"
                  :aria-pressed="selectedTagFilters.has(tag.id)"
                  @click="toggleCreateTagFilter(tag.id)"
                >
                  <!-- The same chip as the view settings' filters, through `.swatch`:
                       a raw `tag.color + '22'` tint kept a dark stored hex unreadable. -->
                  <UIcon
                    :name="selectedTagFilters.has(tag.id) ? 'i-lucide-check' : 'i-lucide-circle'"
                    class="text-2xs"
                    :class="selectedTagFilters.has(tag.id) ? '' : 'swatch-text'"
                    :style="selectedTagFilters.has(tag.id) ? {} : { '--swatch': tag.color }"
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
          class="mx-dialog mt-1"
        />

        <!-- The selection count is the bar's `status` slot: left-aligned
               validation-or-summary text is exactly what it is for. -->
        <div class="px-dialog pt-4 pb-7">
          <UiSaveBar
            :status="selectionSummary"
            cancel-label="Back"
            submit-label="Create"
            submit-icon="i-lucide-plus"
            :loading="creatingView"
            @cancel="viewStep = 2"
            @submit="createView"
          />
        </div>
      </div>
    </template>
  </UiModal>
</template>
