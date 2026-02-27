<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const cardId = route.params.cardId as string
const projectSlug = route.params.slug as string

interface CardDetail {
  id: number
  title: string
  description: string | null
  priority: string
  statusId: string
  assigneeId: string | null
  dueDate: string | null
  tags: Array<{ id: string, name: string, color: string }>
  createdAt: string
  updatedAt: string
  project: { id: string, name: string, slug: string, key: string } | null
  statuses: Array<{ id: string, name: string, color: string | null }>
  members: Array<{ id: string, name: string, avatarUrl: string | null }>
  projectTags: Array<{ id: string, name: string, color: string }>
}
const { data: cardData, error: fetchError, status } = useFetch<CardDetail>(`/api/cards/${cardId}`)
watch(fetchError, (err) => {
  if (err) showError(err)
}, { immediate: true })

const card = computed(() => cardData.value)
const statusesData = computed(() => cardData.value?.statuses || [])
const membersData = computed(() => cardData.value?.members || [])
const projectKey = computed(() => cardData.value?.project?.key || 'TK')

const projectTagsData = computed(() => cardData.value?.projectTags || [])

const UNASSIGNED = '__unassigned__'
const title = ref('')
const description = ref('')
const priority = ref('medium')
const selectedStatusId = ref('')
const selectedAssigneeId = ref(UNASSIGNED)
const selectedTagIds = ref<string[]>([])
const selectedDueDate = ref<string | null>(null)
const dueDateOpen = ref(false)
const saving = ref(false)
const editingDescription = ref(false)
const showDeleteConfirm = ref(false)
const deletingCard = ref(false)
const descriptionEditorRef = ref<{ startEditing: () => void }>()

const selectedTagNames = computed(() => (projectTagsData.value || []).filter(t => selectedTagIds.value.includes(t.id)).map(t => t.name))

// Sync from fetched data once loaded
const synced = ref(false)
watch(card, (c) => {
  if (c && !synced.value) {
    title.value = c.title || ''
    description.value = c.description || ''
    priority.value = c.priority || 'medium'
    selectedStatusId.value = c.statusId || ''
    selectedAssigneeId.value = c.assigneeId || UNASSIGNED
    selectedTagIds.value = (c.tags || []).map(t => t.id)
    selectedDueDate.value = c.dueDate ? new Date(c.dueDate).toISOString().split('T')[0] ?? null : null
    synced.value = true
  }
}, { immediate: true })

const selectedStatusColor = computed(() => {
  const col = statusesData.value.find(c => c.id === selectedStatusId.value)
  return col?.color || '#6366f1'
})

const selectedStatusLabel = computed(() => {
  const col = statusesData.value.find(c => c.id === selectedStatusId.value)
  return col?.name || 'Select status'
})

const selectedAssigneeLabel = computed(() => {
  if (selectedAssigneeId.value === UNASSIGNED) return 'Unassigned'
  const member = membersData.value.find(m => m.id === selectedAssigneeId.value)
  return member?.name || 'Unassigned'
})

const statusMenuItems = computed(() => [[
  ...statusesData.value.map(s => ({
    label: s.name,
    type: 'checkbox' as const,
    checked: selectedStatusId.value === s.id,
    color: s.color,
    onSelect() {
      selectedStatusId.value = s.id
    }
  }))
]])

const assigneeMenuItems = computed(() => [[
  {
    label: 'Unassigned',
    icon: 'i-lucide-user-x',
    type: 'checkbox' as const,
    checked: selectedAssigneeId.value === UNASSIGNED,
    onSelect() {
      selectedAssigneeId.value = UNASSIGNED
    }
  },
  ...membersData.value.map(m => ({
    label: m.name,
    icon: 'i-lucide-user',
    type: 'checkbox' as const,
    checked: selectedAssigneeId.value === m.id,
    onSelect() {
      selectedAssigneeId.value = m.id
    }
  }))
]])

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

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

const isDirty = computed(() => {
  if (!card.value) return false
  const currentTagIds = (card.value.tags || []).map(t => t.id).sort().join(',')
  const selectedSorted = [...selectedTagIds.value].sort().join(',')
  const currentDueDate = card.value.dueDate ? new Date(card.value.dueDate).toISOString().split('T')[0] ?? null : null
  return (
    title.value !== (card.value.title || '')
    || description.value !== (card.value.description || '')
    || priority.value !== (card.value.priority || 'medium')
    || selectedStatusId.value !== (card.value.statusId || '')
    || selectedAssigneeId.value !== (card.value.assigneeId || UNASSIGNED)
    || selectedSorted !== currentTagIds
    || selectedDueDate.value !== currentDueDate
  )
})

// Warn before leaving with unsaved changes
const showLeaveWarning = ref(false)
let pendingNavigation: (() => void) | null = null
let allowLeave = false

onBeforeRouteLeave((to) => {
  if (allowLeave) return true
  if (isDirty.value) {
    showLeaveWarning.value = true
    const path = to.fullPath
    pendingNavigation = () => navigateTo(path)
    return false
  }
})

function confirmLeave() {
  showLeaveWarning.value = false
  allowLeave = true
  const nav = pendingNavigation
  pendingNavigation = null
  nav?.()
}

function cancelLeave() {
  showLeaveWarning.value = false
  pendingNavigation = null
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    e.stopImmediatePropagation()
    submit()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('keydown', handleKeydown, true)
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('keydown', handleKeydown, true)
})

async function submit() {
  if (!title.value.trim() || !selectedStatusId.value || !card.value) return
  saving.value = true
  try {
    const assigneeId = selectedAssigneeId.value === UNASSIGNED ? null : selectedAssigneeId.value
    const updated = await $fetch(`/api/cards/${card.value.id}`, {
      method: 'PUT',
      body: {
        title: title.value.trim(),
        description: description.value.trim(),
        priority: priority.value,
        statusId: selectedStatusId.value,
        assigneeId,
        dueDate: selectedDueDate.value || null
      }
    })

    // Update tags if changed
    const currentTagIds = (card.value.tags || []).map(t => t.id).sort().join(',')
    const selectedSorted = [...selectedTagIds.value].sort().join(',')
    if (selectedSorted !== currentTagIds) {
      const tagResult = await $fetch<{ tags: Array<{ id: string, name: string, color: string }> }>(`/api/cards/${card.value.id}/tags`, {
        method: 'PUT',
        body: { tagIds: selectedTagIds.value }
      })
      if (updated) {
        (updated as { tags?: Array<{ id: string, name: string, color: string }> }).tags = tagResult.tags
      }
    }

    // Sync local state with response
    if (updated) {
      cardData.value = { ...cardData.value, ...updated } as CardDetail
      synced.value = false
      editingDescription.value = false
    }
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!card.value) return
  deletingCard.value = true
  try {
    await $fetch(`/api/cards/${card.value.id}`, { method: 'DELETE' })
    await navigateTo(`/projects/${projectSlug}`)
  } catch (e: unknown) {
    useToast().add({ title: 'Failed to delete card', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
    deletingCard.value = false
  }
}
</script>

<template>
  <div class="min-h-full">
    <div class="max-w-[1080px] mx-auto px-5 py-6">
      <!-- Breadcrumb -->
      <div class="flex items-center justify-between mb-5">
        <UBreadcrumb
          :items="[
            { label: cardData?.project?.name || '', to: `/projects/${projectSlug}`, icon: 'i-lucide-folder' },
            { label: card ? formatTicketId(projectKey, card.id) : '', icon: 'i-lucide-square-check-big' }
          ]"
        />
        <NotificationBell />
      </div>

      <!-- Loading state -->
      <div
        v-if="status === 'pending'"
        class="flex gap-6"
      >
        <div class="flex-1 flex flex-col gap-4">
          <div class="h-8 w-32 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          <div class="h-10 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          <div class="h-64 w-full bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
        </div>
        <div class="hidden lg:block w-[260px] shrink-0">
          <div class="h-48 bg-zinc-200 dark:bg-zinc-700 rounded-xl animate-pulse" />
        </div>
      </div>

      <!-- Card not found -->
      <div
        v-else-if="!card && status === 'success'"
        class="text-center py-16"
      >
        <UIcon
          name="i-lucide-search-x"
          class="text-[32px] text-zinc-300 dark:text-zinc-600 mb-3"
        />
        <p class="text-[14px] text-zinc-500 dark:text-zinc-400">
          Card not found
        </p>
        <NuxtLink
          :to="`/projects/${projectSlug}`"
          class="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-500 hover:text-indigo-600 mt-2 transition-colors"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="text-[13px]"
          />
          Back to project
        </NuxtLink>
      </div>

      <!-- Card detail: two-panel layout -->
      <form
        v-else-if="card"
        class="flex flex-col lg:flex-row gap-6 lg:items-start"
        @submit.prevent="submit"
      >
        <!-- ═══ SIDEBAR — properties, priority, actions (sticky on desktop) ═══ -->
        <aside class="w-full lg:w-[260px] shrink-0 lg:order-2 lg:sticky lg:top-4">
          <div class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden">
            <!-- Card ID header -->
            <div class="px-4 pt-3.5 pb-3 border-b border-zinc-100 dark:border-zinc-700/40">
              <span class="font-mono text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {{ formatTicketId(projectKey, card.id) }}
              </span>
            </div>

            <!-- Properties -->
            <div class="divide-y divide-zinc-100 dark:divide-zinc-700/40">
              <!-- Status -->
              <div class="flex items-center gap-2 px-4 py-2.5">
                <span class="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 w-[72px] shrink-0">Status</span>
                <UDropdownMenu
                  :items="statusMenuItems"
                  :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    <span class="w-[13px] flex items-center justify-center shrink-0"><span
                      class="w-2 h-2 rounded-full"
                      :style="{ backgroundColor: selectedStatusColor }"
                    /></span>
                    {{ selectedStatusLabel }}
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="text-[10px] opacity-50"
                    />
                  </button>
                  <template #item="{ item }">
                    <span class="flex items-center gap-1.5">
                      <span
                        class="w-2 h-2 rounded-full shrink-0 inline-block"
                        :style="{ backgroundColor: item.color ?? undefined }"
                      />
                      <span class="truncate">{{ item.label }}</span>
                    </span>
                  </template>
                </UDropdownMenu>
              </div>

              <!-- Assignee -->
              <div class="flex items-center gap-2 px-4 py-2.5">
                <span class="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 w-[72px] shrink-0">Assignee</span>
                <UDropdownMenu
                  :items="assigneeMenuItems"
                  :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    <span class="w-[13px] flex items-center justify-center shrink-0"><UIcon
                      name="i-lucide-user"
                      class="text-[13px]"
                      :class="selectedAssigneeId === UNASSIGNED ? 'text-zinc-400' : 'text-indigo-500'"
                    /></span>
                    {{ selectedAssigneeLabel }}
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="text-[10px] opacity-50"
                    />
                  </button>
                </UDropdownMenu>
              </div>

              <!-- Priority -->
              <div class="flex items-center gap-2 px-4 py-2.5">
                <span class="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 w-[72px] shrink-0">Priority</span>
                <UDropdownMenu
                  :items="priorityMenuItems"
                  :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium capitalize transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800"
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

              <!-- Due Date -->
              <div class="flex items-center gap-2 px-4 py-2.5">
                <span class="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 w-[72px] shrink-0">Due</span>
                <DueDatePicker
                  v-model:open="dueDateOpen"
                  :model-value="selectedDueDate"
                  :popover-options="{ align: 'start', side: 'bottom', sideOffset: 4 }"
                  @update:model-value="selectedDueDate = $event"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    :style="selectedDueDate ? { color: dueDateColor(getDueDateStatus(selectedDueDate)) } : {}"
                    :class="!selectedDueDate ? 'text-zinc-400 dark:text-zinc-500' : ''"
                  >
                    <span class="w-[13px] flex items-center justify-center shrink-0"><UIcon
                      :name="selectedDueDate ? dueDateIcon(getDueDateStatus(selectedDueDate)) : 'i-lucide-calendar'"
                      class="text-[13px]"
                    /></span>
                    {{ selectedDueDate ? formatDueDate(selectedDueDate) : 'Set date' }}
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="text-[10px] opacity-50"
                    />
                  </button>
                </DueDatePicker>
              </div>

              <!-- Tags -->
              <div
                v-if="projectTagsData.length"
                class="flex items-center gap-2 px-4 py-2.5"
              >
                <span class="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 w-[72px] shrink-0">Tags</span>
                <UPopover :content="{ align: 'start', side: 'bottom', sideOffset: 4 }">
                  <button
                    type="button"
                    class="flex flex-wrap gap-1 items-center rounded-md px-1.5 py-0.5 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <template v-if="selectedTagIds.length">
                      <TagPill
                        v-for="tag in projectTagsData.filter((t: { id: string }) => selectedTagIds.includes(t.id))"
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
                      :tags="projectTagsData"
                      :selected-ids="selectedTagIds"
                      @toggle="toggleTag"
                    />
                  </template>
                </UPopover>
              </div>
            </div>

            <!-- Timestamps -->
            <div class="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-700/40 flex flex-col gap-1">
              <span
                v-if="card.createdAt"
                class="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 font-mono"
              >
                <UIcon
                  name="i-lucide-calendar-plus"
                  class="text-[11px] opacity-60"
                />
                {{ formatDate(card.createdAt) }}
              </span>
              <span
                v-if="card.updatedAt && card.updatedAt !== card.createdAt"
                class="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 font-mono"
              >
                <UIcon
                  name="i-lucide-calendar-clock"
                  class="text-[11px] opacity-60"
                />
                {{ formatDate(card.updatedAt) }}
              </span>
            </div>

            <!-- Actions -->
            <div class="px-4 py-3 border-t border-zinc-100 dark:border-zinc-700/40 flex flex-col gap-2">
              <button
                type="submit"
                class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!title.trim() || !isDirty || saving"
              >
                <UIcon
                  v-if="saving"
                  name="i-lucide-loader-2"
                  class="text-[14px] animate-spin"
                />
                <template v-else>
                  Save
                  <kbd class="ml-2 text-[11px] font-mono opacity-75 bg-white/15 px-1.5 py-0.5 rounded">Cmd+Enter</kbd>
                </template>
              </button>

              <!-- Delete confirmation -->
              <div
                v-if="showDeleteConfirm"
                class="rounded-lg border border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3 flex flex-col gap-2"
              >
                <p class="text-[12px] font-medium text-red-600 dark:text-red-400 leading-relaxed">
                  Are you sure you want to delete this card?
                </p>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="deletingCard"
                    @click="confirmDelete"
                  >
                    <UIcon
                      v-if="!deletingCard"
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
                    class="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                    @click="showDeleteConfirm = false"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <button
                v-else
                type="button"
                class="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                @click="showDeleteConfirm = true"
              >
                <UIcon
                  name="i-lucide-trash-2"
                  class="text-[12px]"
                />
                Delete card
              </button>
            </div>
          </div>
        </aside>

        <!-- ═══ MAIN CONTENT — title + description ═══ -->
        <div class="flex-1 min-w-0 lg:order-1">
          <!-- Title -->
          <input
            v-model="title"
            type="text"
            placeholder="Card title..."
            class="w-full text-[20px] font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 rounded-none outline-none! ring-0! tracking-[-0.015em] leading-snug py-2 mb-4 transition-colors"
          >

          <!-- Description header -->
          <div class="flex items-center gap-1.5 mb-2">
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

          <!-- Description: edit mode -->
          <DescriptionEditor
            v-if="editingDescription"
            ref="descriptionEditorRef"
            v-model="description"
            :title="title"
            :tags="selectedTagNames"
            :priority="priority"
            :project-slug="projectSlug"
            :project-key="projectKey"
            :members="membersData"
            :card-id="card?.id"
            :min-height="240"
            @escape="editingDescription = false"
          />

          <!-- Description: read mode -->
          <div
            v-else-if="description"
            class="select-text"
          >
            <ProseDescription :content="description" />
          </div>

          <!-- Attachments -->
          <div class="mt-6">
            <AttachmentList :card-id="card?.id" />
          </div>
        </div>
      </form>
    </div>

    <!-- Unsaved changes warning -->
    <UModal
      v-model:open="showLeaveWarning"
      :ui="{ content: 'sm:max-w-[400px]', header: 'hidden', footer: 'hidden', body: 'p-0 sm:p-0' }"
    >
      <template #body>
        <div class="p-5 flex flex-col items-center text-center gap-3">
          <div class="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
            <UIcon
              name="i-lucide-triangle-alert"
              class="text-[20px] text-amber-500"
            />
          </div>
          <p class="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            Unsaved changes
          </p>
          <p class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            You have unsaved changes that will be lost if you leave this page.
          </p>
          <div class="flex items-center gap-2 mt-1 w-full">
            <button
              type="button"
              class="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              @click="cancelLeave"
            >
              Stay
            </button>
            <button
              type="button"
              class="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              @click="confirmLeave"
            >
              Leave
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
