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
const showIconPicker = ref(false)
const iconFilter = ref('')

// Done status
const doneStatusName = ref('Done')
const doneStatusId = ref<string | null>(null)
const doneRetentionDays = ref<number | null>(30)

// Key/slug availability (declared early — used by resetToDefaults before full init)
const keyAvailable = ref<boolean | null>(null)
const slugAvailable = ref<boolean | null>(null)

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
  showIconPicker.value = false
  iconFilter.value = ''
  doneStatusName.value = 'Done'
  doneStatusId.value = null
  doneRetentionDays.value = 30
  showDeleteConfirm.value = false
  keyAvailable.value = null
  slugAvailable.value = null
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
  showIconPicker.value = false
  iconFilter.value = ''
  showDeleteConfirm.value = false
  keyAvailable.value = null
  slugAvailable.value = null
}, { immediate: true })

// Icon picker
const filteredIcons = computed(() => {
  if (!iconFilter.value) return PROJECT_ICONS as readonly string[]
  const q = iconFilter.value.toLowerCase()
  return ALL_LUCIDE_ICONS.filter(i => i.includes(q))
})

function selectIcon(name: string) {
  formIcon.value = name
  showIconPicker.value = false
  iconFilter.value = ''
}

function applyFilterAsIcon() {
  const cleaned = iconFilter.value.trim().toLowerCase().replace(/^i-lucide-/, '')
  if (cleaned) {
    formIcon.value = cleaned
    showIconPicker.value = false
    iconFilter.value = ''
  }
}

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

// Key availability check
const keyChecking = ref(false)
let keyCheckTimeout: ReturnType<typeof setTimeout> | null = null
let keyAbortController: AbortController | null = null

watch(formKey, (val) => {
  keyAvailable.value = null
  if (keyCheckTimeout) clearTimeout(keyCheckTimeout)
  if (keyAbortController) keyAbortController.abort()
  if (!val || !keyValid.value) return
  keyChecking.value = true
  keyCheckTimeout = setTimeout(async () => {
    keyAbortController = new AbortController()
    try {
      const params: Record<string, string> = { key: val }
      if (props.initialData?.id) params.exclude = props.initialData.id
      const { available } = await $fetch<{ available: boolean }>('/api/projects/check-key', { params, signal: keyAbortController.signal })
      if (formKey.value === val) keyAvailable.value = available
    } catch {
      keyAvailable.value = null
    } finally {
      keyChecking.value = false
    }
  }, 300)
})

// Slug availability check
const slugChecking = ref(false)
let slugCheckTimeout: ReturnType<typeof setTimeout> | null = null
let slugAbortController: AbortController | null = null

watch(formSlug, (val) => {
  slugAvailable.value = null
  if (slugCheckTimeout) clearTimeout(slugCheckTimeout)
  if (slugAbortController) slugAbortController.abort()
  if (!val || !slugValid.value) return
  slugChecking.value = true
  slugCheckTimeout = setTimeout(async () => {
    slugAbortController = new AbortController()
    try {
      const params: Record<string, string> = { slug: val }
      if (props.initialData?.id) params.exclude = props.initialData.id
      const { available } = await $fetch<{ available: boolean }>('/api/projects/check-slug', { params, signal: slugAbortController.signal })
      if (formSlug.value === val) slugAvailable.value = available
    } catch {
      slugAvailable.value = null
    } finally {
      slugChecking.value = false
    }
  }, 300)
})

// Cleanup on unmount
onUnmounted(() => {
  if (keyCheckTimeout) clearTimeout(keyCheckTimeout)
  if (slugCheckTimeout) clearTimeout(slugCheckTimeout)
  if (keyAbortController) keyAbortController.abort()
  if (slugAbortController) slugAbortController.abort()
})

// Submit
const canSubmit = computed(() => {
  if (!formName.value.trim()) return false
  if (!keyValid.value || keyAvailable.value === false) return false
  if (!slugValid.value || slugAvailable.value === false) return false
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
  <form
    :class="[
      'rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden',
      mode === 'create' && 'border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm'
    ]"
    @submit.prevent="onSubmit"
  >
    <!-- Name input -->
    <div class="px-5 pt-5 pb-1">
      <input
        v-model="formName"
        type="text"
        placeholder="Project name..."
        autofocus
        class="w-full text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-2 transition-colors"
      >
    </div>

    <!-- Description -->
    <div class="px-5 pt-1">
      <textarea
        v-model="formDescription"
        placeholder="What is this project about?"
        rows="2"
        class="w-full text-[14px] text-zinc-600 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-300 dark:focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none leading-relaxed"
      />
    </div>

    <!-- Agent Briefing -->
    <div class="px-5 pt-2">
      <button
        v-if="!showBriefingEditor"
        type="button"
        class="flex items-center gap-1.5 text-[12px] font-semibold text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
        @click="showBriefingEditor = true"
      >
        <UIcon
          name="i-lucide-sparkles"
          class="text-[12px]"
        />
        {{ formBriefing ? 'Edit agent briefing' : 'Add agent briefing' }}
      </button>
      <template v-if="showBriefingEditor">
        <div class="flex items-center gap-1.5 mb-1.5">
          <UIcon
            name="i-lucide-sparkles"
            class="text-[12px] text-violet-500"
          />
          <span class="text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500">
            Agent Briefing
          </span>
          <span class="text-[10px] text-zinc-400 dark:text-zinc-500">
            — sent as context to AI
          </span>
        </div>
        <textarea
          v-model="formBriefing"
          placeholder="Describe the project scope, tech stack, conventions, goals... This context helps AI write better card descriptions."
          rows="6"
          class="w-full text-[14px] text-zinc-600 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 rounded-lg px-3 py-2.5 outline-none focus:border-violet-300 dark:focus:border-violet-600 focus:ring-2 focus:ring-violet-500/10 transition-all resize-none leading-relaxed"
        />
      </template>
    </div>

    <!-- Properties -->
    <div class="mx-5 mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700/60 divide-y divide-zinc-100 dark:divide-zinc-700/40 overflow-hidden">
      <!-- Icon row -->
      <div class="bg-white dark:bg-zinc-800/50">
        <div
          class="flex items-center px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
          @click="showIconPicker = !showIconPicker"
        >
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon
              name="i-lucide-smile"
              class="text-sm text-zinc-400"
            />
            <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Icon</span>
          </div>
          <div class="flex-1 flex items-center gap-2.5">
            <UIcon
              :name="`i-lucide-${formIcon}`"
              class="text-[16px] text-zinc-700 dark:text-zinc-200"
            />
            <span class="text-[14px] font-medium text-zinc-600 dark:text-zinc-300">{{ formIcon }}</span>
            <span class="ml-auto text-[12px] font-semibold text-indigo-500 dark:text-indigo-400 transition-colors">
              {{ showIconPicker ? 'Close' : 'Change' }}
            </span>
          </div>
        </div>
        <!-- Icon picker panel -->
        <div
          v-if="showIconPicker"
          class="px-3 pb-3 space-y-2.5"
        >
          <input
            v-model="iconFilter"
            type="text"
            placeholder="Search or type any icon name..."
            class="w-full text-[13px] text-zinc-600 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors"
            @keydown.enter.prevent="applyFilterAsIcon"
          >
          <div class="grid grid-cols-8 gap-1">
            <button
              v-for="ic in filteredIcons"
              :key="ic"
              type="button"
              class="flex items-center justify-center w-full aspect-square rounded-md transition-all"
              :class="formIcon === ic
                ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-300 dark:ring-indigo-500/50'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 hover:text-zinc-700 dark:hover:text-zinc-200'"
              :title="ic"
              @click.stop="selectIcon(ic)"
            >
              <UIcon
                :name="`i-lucide-${ic}`"
                class="text-[16px]"
              />
            </button>
          </div>
          <div
            v-if="filteredIcons.length === 0"
            class="text-center py-2 text-[12px] text-zinc-400"
          >
            No matching icons — press Enter to use "{{ iconFilter }}"
          </div>
          <p class="text-[12px] text-zinc-400 dark:text-zinc-500">
            Can't find what you need? Find a name on
            <a
              href="https://lucide.dev/icons"
              target="_blank"
              class="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
            >lucide.dev/icons<UIcon
              name="i-lucide-external-link"
              class="text-[9px] ml-0.5 inline-block align-[1px]"
            /></a>
          </p>
        </div>
      </div>

      <!-- Key row -->
      <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-key-round"
            class="text-sm text-zinc-400"
          />
          <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Key</span>
        </div>
        <div class="flex-1 flex items-center gap-2.5">
          <input
            :value="formKey"
            type="text"
            placeholder="ENG"
            maxlength="5"
            class="flex-1 text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0! uppercase tracking-wide"
            @input="onKeyInput"
          >
          <span
            class="font-mono text-[10.5px] font-medium px-1.5 py-0.5 rounded transition-colors shrink-0"
            :class="formKey
              ? 'text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
              : 'text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800'"
          >
            {{ keyPreview }}
          </span>
          <UIcon
            v-if="keyChecking"
            name="i-lucide-loader-2"
            class="text-[14px] text-zinc-400 animate-spin shrink-0"
          />
          <UIcon
            v-else-if="formKey && keyValid && keyAvailable === true"
            name="i-lucide-check"
            class="text-[14px] text-emerald-500 shrink-0"
          />
          <UIcon
            v-else-if="formKey && keyValid && keyAvailable === false"
            name="i-lucide-x"
            class="text-[14px] text-red-500 shrink-0"
          />
        </div>
      </div>

      <!-- Slug row -->
      <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-link"
            class="text-sm text-zinc-400"
          />
          <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Slug</span>
        </div>
        <div class="flex-1 flex items-center gap-2.5">
          <input
            :value="formSlug"
            type="text"
            placeholder="my-project"
            class="flex-1 text-[14px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0! tracking-wide"
            @input="onSlugInput"
          >
          <UIcon
            v-if="slugChecking"
            name="i-lucide-loader-2"
            class="text-[14px] text-zinc-400 animate-spin shrink-0"
          />
          <UIcon
            v-else-if="formSlug && slugAvailable === true"
            name="i-lucide-check"
            class="text-[14px] text-emerald-500 shrink-0"
          />
          <UIcon
            v-else-if="formSlug && slugAvailable === false"
            name="i-lucide-x"
            class="text-[14px] text-red-500 shrink-0"
          />
        </div>
      </div>

      <!-- Done status row — inline retention -->
      <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-circle-check-big"
            class="text-sm text-zinc-400"
          />
          <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Done status</span>
        </div>
        <div class="flex-1 flex items-center gap-3">
          <!-- Create mode: select by name -->
          <select
            v-if="mode === 'create'"
            v-model="doneStatusName"
            class="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-0 outline-none cursor-pointer"
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
              class="text-[14px] text-zinc-400 animate-spin"
            />
            <select
              v-else
              :value="doneStatusId || ''"
              class="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-0 outline-none cursor-pointer"
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
          <span class="text-zinc-200 dark:text-zinc-700">·</span>
          <div class="flex items-center gap-1.5 ml-auto">
            <span class="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">keep</span>
            <input
              :value="doneRetentionDays ?? ''"
              type="number"
              min="1"
              placeholder="∞"
              class="w-12 text-[13px] font-semibold text-center text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-zinc-100 dark:bg-zinc-700/50 border-0 outline-none! ring-0! rounded-md py-0.5"
              @input="doneRetentionDays = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
            >
            <span class="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">days</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="text-[14px] text-red-500 shrink-0"
      />
      <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ error }}</span>
    </div>

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
      class="flex items-center px-5 pt-4 pb-5 mt-4 border-t border-zinc-100 dark:border-zinc-700/40"
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
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
          @click="showDeleteConfirm = true"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="text-[14px]"
          />
          Delete
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <span class="text-[10px] font-mono text-zinc-300 dark:text-zinc-600 hidden sm:block">
          <kbd class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500">&#8984;&#x23CE;</kbd>
        </span>
        <button
          type="submit"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!canSubmit"
        >
          <UIcon
            v-if="!loading"
            :name="mode === 'create' ? 'i-lucide-plus' : 'i-lucide-check'"
            class="text-[14px]"
          />
          <UIcon
            v-else
            name="i-lucide-loader-2"
            class="text-[14px] animate-spin"
          />
          {{ mode === 'create' ? 'Create' : 'Save' }}
        </button>
      </div>
    </div>
  </form>
</template>
