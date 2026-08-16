<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  initialData?: {
    id: string
    name: string
    key: string
    slug: string
    description: string | null
    briefing: string | null
    icon: string | null
    doneStatusId: string | null
    doneRetentionDays: number | null
  }
  statuses?: Array<{ id: string, name: string, color: string | null }>
  loadingStatuses?: boolean
  loading?: boolean
  deleting?: boolean
  error?: string
}>(), {
  loadingStatuses: false,
  loading: false,
  deleting: false
})

const emit = defineEmits<{
  submit: [data: Record<string, unknown>]
  cancel: []
  delete: []
}>()

// Default status names for create mode
const defaultStatusNames = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']

// Form state
const formName = ref('')
const formKey = ref('')
const keyManuallyEdited = ref(false)
const formSlug = ref('')
const slugManuallyEdited = ref(false)
const formDescription = ref('')
const formBriefing = ref('')
const showBriefingEditor = ref(false)
const formIcon = ref('folder')

// Done status
const doneStatusName = ref('Done')
const doneStatusId = ref<string | null>(null)
const doneRetentionDays = ref<number | null>(30)

// Key/slug availability
const keyCheck = useAvailabilityCheck({
  endpoint: '/api/projects/check-key',
  paramName: 'key',
  validate: v => /^[A-Z]{2,5}$/.test(v),
  excludeId: computed(() => props.initialData?.id)
})

const slugCheck = useAvailabilityCheck({
  endpoint: '/api/projects/check-slug',
  paramName: 'slug',
  validate: v => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
  excludeId: computed(() => props.initialData?.id)
})

// Delete confirmation (edit mode)
const showDeleteConfirm = ref(false)

// Initialize / reinitialize from props
function resetToDefaults() {
  formName.value = ''
  formKey.value = ''
  keyManuallyEdited.value = false
  formSlug.value = ''
  slugManuallyEdited.value = false
  formDescription.value = ''
  formBriefing.value = ''
  showBriefingEditor.value = false
  formIcon.value = 'folder'
  doneStatusName.value = 'Done'
  doneStatusId.value = null
  doneRetentionDays.value = 30
  showDeleteConfirm.value = false
  keyCheck.reset()
  slugCheck.reset()
}

watch(() => props.initialData, (data) => {
  if (data) {
    formName.value = data.name || ''
    formKey.value = data.key || ''
    formSlug.value = data.slug || ''
    formDescription.value = data.description || ''
    formBriefing.value = data.briefing || ''
    showBriefingEditor.value = !!data.briefing
    formIcon.value = data.icon || 'folder'
    doneStatusId.value = data.doneStatusId ?? null
    doneRetentionDays.value = data.doneRetentionDays ?? null
    keyManuallyEdited.value = true
    slugManuallyEdited.value = true
  } else {
    resetToDefaults()
  }
  showDeleteConfirm.value = false
  keyCheck.reset()
  slugCheck.reset()
}, { immediate: true })

// Key/slug auto-generation (create mode only)
function generateKey(projectName: string): string {
  const parts = projectName.split(/[\s\-_]+/).filter(w => w.length > 0)
  const words = parts.flatMap(w => w.split(/(?<=[a-z])(?=[A-Z])/))
  let k = words.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '')
  if (k.length < 2 && words.length > 0) {
    k = words[0]!.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
  }
  return k.slice(0, 5)
}

if (props.mode === 'create') {
  watch(formName, (val) => {
    if (!keyManuallyEdited.value) formKey.value = generateKey(val)
    if (!slugManuallyEdited.value) formSlug.value = generateSlug(val)
  })
}

function onKeyInput(e: Event) {
  const input = e.target as HTMLInputElement
  input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
  formKey.value = input.value
  keyManuallyEdited.value = true
}

function onSlugInput(e: Event) {
  const input = e.target as HTMLInputElement
  input.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-')
  formSlug.value = input.value
  slugManuallyEdited.value = true
}

// Key/slug validation
const keyPreview = computed(() => (formKey.value || 'XX') + '-1A2B')
const keyValid = computed(() => /^[A-Z]{2,5}$/.test(formKey.value))
const slugValid = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formSlug.value))

// Trigger availability checks when values change
watch(formKey, val => keyCheck.check(val))
watch(formSlug, val => slugCheck.check(val))

// Cleanup on unmount
onUnmounted(() => {
  keyCheck.cleanup()
  slugCheck.cleanup()
})

// Submit
const canSubmit = computed(() => {
  if (!formName.value.trim()) return false
  if (!keyValid.value || keyCheck.available.value === false) return false
  if (!slugValid.value || slugCheck.available.value === false) return false
  if (props.loading) return false
  return true
})

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    e.stopImmediatePropagation()
    onSubmit()
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown, true))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown, true))

function onSubmit() {
  if (!canSubmit.value) return

  const base = {
    name: formName.value.trim(),
    key: formKey.value,
    slug: formSlug.value,
    description: formDescription.value.trim(),
    briefing: formBriefing.value.trim() || null,
    icon: formIcon.value === 'folder' ? null : formIcon.value,
    doneRetentionDays: doneRetentionDays.value
  }

  if (props.mode === 'create') {
    emit('submit', { ...base, doneStatusName: doneStatusName.value })
  } else {
    emit('submit', { ...base, doneStatusId: doneStatusId.value })
  }
}

function confirmDelete() {
  showDeleteConfirm.value = false
  emit('delete')
}
</script>

<template>
  <!--
    overflow-y-auto, not hidden: in edit mode UModal caps this form's height, and the form
    already sits close to that cap, so opening the icon picker used to clip the bottom
    ~440px with no way to scroll — the Save button included. On the create page the form
    isn't height-constrained, so `auto` shows no scrollbar there.
  -->
  <form
    :class="[
      'rounded-xl bg-default overflow-x-hidden overflow-y-auto',
      mode === 'create' && 'border border-default shadow-raise'
    ]"
    @submit.prevent="onSubmit"
  >
    <!-- Name input -->
    <div class="px-5 pt-5 pb-1">
      <input
        v-model="formName"
        type="text"
        aria-label="Project name"
        placeholder="Project name..."
        autofocus
        class="w-full text-lg font-semibold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent focus:border-accented rounded-none outline-none! ring-0! tracking-name leading-snug py-2 transition-colors"
      >
    </div>

    <!-- Description -->
    <div class="px-5 pt-1">
      <textarea
        v-model="formDescription"
        aria-label="Project description"
        placeholder="What is this project about?"
        rows="2"
        class="w-full text-base text-toned placeholder:text-dimmed bg-muted border border-default rounded-lg px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors resize-none leading-relaxed"
      />
    </div>

    <!-- Agent Briefing -->
    <div class="px-5 pt-2">
      <button
        v-if="!showBriefingEditor"
        type="button"
        class="flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary transition-colors"
        @click="showBriefingEditor = true"
      >
        <UIcon
          name="i-lucide-sparkles"
          class="text-xs"
        />
        {{ formBriefing ? 'Edit agent briefing' : 'Add agent briefing' }}
      </button>
      <template v-if="showBriefingEditor">
        <div class="flex items-center gap-1.5 mb-1.5">
          <UIcon
            name="i-lucide-sparkles"
            class="text-xs text-secondary"
          />
          <span class="text-xs font-semibold uppercase tracking-label text-dimmed">
            Agent Briefing
          </span>
          <span class="text-2xs text-dimmed">
            — sent as context to AI
          </span>
        </div>
        <textarea
          v-model="formBriefing"
          aria-label="Project briefing"
          placeholder="Describe the project scope, tech stack, conventions, goals... This context helps AI write better card descriptions."
          rows="6"
          class="w-full text-base text-toned placeholder:text-dimmed bg-muted border border-default rounded-lg px-3 py-2.5 outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/10 transition-colors resize-none leading-relaxed"
        />
      </template>
    </div>

    <!-- Properties -->
    <div class="mx-5 mt-4 rounded-lg border border-accented divide-y divide-default overflow-hidden">
      <!-- Icon row -->
      <ProjectIconPicker v-model="formIcon" />

      <!-- Key row -->
      <div class="flex items-center px-3 py-2.5 bg-default">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-key-round"
            class="text-sm text-dimmed"
          />
          <span class="text-sm font-medium text-muted">Key</span>
        </div>
        <div class="flex-1 flex items-center gap-2.5">
          <input
            :value="formKey"
            type="text"
            aria-label="Project key"
            placeholder="ENG"
            maxlength="5"
            class="flex-1 text-base font-semibold text-highlighted placeholder:text-dimmed bg-transparent border-0 uppercase tracking-wide"
            @input="onKeyInput"
          >
          <span
            class="font-mono text-2xs font-medium px-1.5 py-0.5 rounded-md transition-colors shrink-0"
            :class="formKey
              ? 'text-primary bg-primary/10'
              : 'text-dimmed bg-elevated'"
          >
            {{ keyPreview }}
          </span>
          <UIcon
            v-if="keyCheck.checking.value"
            name="i-lucide-loader-2"
            class="text-base text-dimmed animate-spin shrink-0"
          />
          <UIcon
            v-else-if="formKey && keyValid && keyCheck.available.value === true"
            name="i-lucide-check"
            class="text-base text-success shrink-0"
          />
          <UIcon
            v-else-if="formKey && keyValid && keyCheck.available.value === false"
            name="i-lucide-x"
            class="text-base text-error shrink-0"
          />
        </div>
      </div>

      <!-- Slug row -->
      <div class="flex items-center px-3 py-2.5 bg-default">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-link"
            class="text-sm text-dimmed"
          />
          <span class="text-sm font-medium text-muted">Slug</span>
        </div>
        <div class="flex-1 flex items-center gap-2.5">
          <input
            :value="formSlug"
            type="text"
            aria-label="URL slug"
            placeholder="my-project"
            class="flex-1 text-base font-medium text-highlighted placeholder:text-dimmed bg-transparent border-0 tracking-wide"
            @input="onSlugInput"
          >
          <UIcon
            v-if="slugCheck.checking.value"
            name="i-lucide-loader-2"
            class="text-base text-dimmed animate-spin shrink-0"
          />
          <UIcon
            v-else-if="formSlug && slugCheck.available.value === true"
            name="i-lucide-check"
            class="text-base text-success shrink-0"
          />
          <UIcon
            v-else-if="formSlug && slugCheck.available.value === false"
            name="i-lucide-x"
            class="text-base text-error shrink-0"
          />
        </div>
      </div>

      <!-- Done status row — inline retention -->
      <div class="flex items-center px-3 py-2.5 bg-default">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-circle-check-big"
            class="text-sm text-dimmed"
          />
          <span class="text-sm font-medium text-muted">Done status</span>
        </div>
        <div class="flex-1 flex items-center gap-3">
          <!-- Create mode: select by name -->
          <select
            v-if="mode === 'create'"
            v-model="doneStatusName"
            aria-label="Done status"
            class="text-base font-medium text-highlighted bg-transparent border-0 outline-none cursor-pointer"
          >
            <option
              v-for="col in defaultStatusNames"
              :key="col"
              :value="col"
            >
              {{ col }}
            </option>
          </select>
          <!-- Edit mode: select by ID from actual statuses -->
          <template v-else>
            <UIcon
              v-if="loadingStatuses"
              name="i-lucide-loader-2"
              class="text-base text-dimmed animate-spin"
            />
            <select
              v-else
              :value="doneStatusId || ''"
              aria-label="Done status"
              class="text-base font-medium text-highlighted bg-transparent border-0 outline-none cursor-pointer"
              @change="doneStatusId = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">
                None
              </option>
              <option
                v-for="col in statuses"
                :key="col.id"
                :value="col.id"
              >
                {{ col.name }}
              </option>
            </select>
          </template>
          <span class="text-dimmed">·</span>
          <div class="flex items-center gap-1.5 ml-auto">
            <span class="text-xs font-medium text-dimmed uppercase tracking-wider">keep</span>
            <input
              :value="doneRetentionDays ?? ''"
              type="number"
              aria-label="Days to keep done cards"
              min="1"
              placeholder="∞"
              class="w-12 text-sm font-semibold text-center text-highlighted placeholder:text-dimmed bg-elevated border-0 rounded-md py-0.5"
              @input="doneRetentionDays = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
            >
            <span class="text-xs font-medium text-dimmed uppercase tracking-wider">days</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-circle"
      :description="error"
      class="mx-5 mt-3"
    />

    <!-- Delete confirmation (edit mode only) -->
    <DeleteConfirmation
      v-if="mode === 'edit'"
      v-model:show="showDeleteConfirm"
      :name="formName"
      message="This will permanently delete the project, all boards, statuses, and cards."
      :loading="deleting"
      class="mx-5 mt-3"
      @confirm="confirmDelete"
    />

    <!-- Actions -->
    <div
      class="flex items-center px-5 pt-4 pb-5 mt-4 border-t border-muted"
      :class="mode === 'edit' ? 'justify-between' : 'justify-end'"
    >
      <!-- Delete button (edit mode only) -->
      <div
        v-if="mode === 'edit'"
        class="flex items-center gap-1.5"
      >
        <button
          v-if="!showDeleteConfirm"
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold text-error hover:text-error hover:bg-error/10 transition-colors"
          @click="showDeleteConfirm = true"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="text-base"
          />
          Delete
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <!-- See CreateViewModal: the shortcut rides on its own button. -->
        <UButton
          type="submit"
          :label="mode === 'create' ? 'Create' : 'Save'"
          :icon="mode === 'create' ? 'i-lucide-plus' : 'i-lucide-check'"
          :loading="loading"
          :disabled="!canSubmit"
        >
          <template #trailing>
            <UiKey value="meta" />
            <UiKey value="enter" />
          </template>
        </UButton>
      </div>
    </div>
  </form>
</template>
