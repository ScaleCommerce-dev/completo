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
  /** Null if the creator's account was deleted, or the card predates creator tracking. */
  creator: { id: string, name: string, avatarUrl: string | null } | null
  createdAt: string
  updatedAt: string
  project: { id: string, name: string, slug: string, key: string } | null
  statuses: Array<{ id: string, name: string, color: string | null }>
  members: Array<{ id: string, name: string, avatarUrl: string | null }>
  projectTags: Array<{ id: string, name: string, color: string }>
  /** Viewer's role in this project; admins get a synthetic 'owner'. */
  role: string
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
// Owners (and admins, who resolve to a synthetic 'owner') may delete others' comments
const canModerateComments = computed(() => cardData.value?.role === 'owner')

const UNASSIGNED = '__unassigned__'
const title = ref('')
const description = ref('')
const priority = ref('medium')
const selectedStatusId = ref('')
const selectedAssigneeId = ref(UNASSIGNED)
const selectedTagIds = ref<string[]>([])
const selectedDueDate = ref<string | null>(null)
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
    // A nested editor claims the shortcut for itself, so Cmd+Enter follows focus:
    // in the comment box it posts the comment instead of saving the card.
    if ((e.target as HTMLElement | null)?.closest?.('[data-comment-editor]')) return
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
  <UiPage width="wide">
    <template #title>
      <UBreadcrumb
        :items="[
          { label: cardData?.project?.name || '', to: `/projects/${projectSlug}`, icon: 'i-lucide-folder' },
          { label: card ? formatTicketId(projectKey, card.id) : '', icon: 'i-lucide-square-check-big' }
        ]"
      />
    </template>

    <div
      v-if="status === 'pending'"
      class="flex flex-col lg:flex-row gap-6"
    >
      <div class="flex-1 flex flex-col gap-4">
        <USkeleton class="h-6 w-32" />
        <USkeleton class="h-9 w-3/4" />
        <USkeleton class="h-64 w-full" />
      </div>
      <USkeleton class="hidden lg:block h-48 w-[304px] shrink-0" />
    </div>

    <UEmpty
      v-else-if="!card && status === 'success'"
      class="py-16"
      icon="i-lucide-search-x"
      title="Card not found"
      description="It may have been deleted, or the ticket ID is wrong."
      :actions="[{
        label: 'Back to project',
        icon: 'i-lucide-arrow-left',
        variant: 'subtle',
        to: `/projects/${projectSlug}`
      }]"
    />

    <!-- Card detail: two-panel layout -->
    <form
      v-else-if="card"
      class="flex flex-col lg:flex-row gap-6 lg:items-start"
      @submit.prevent="submit"
    >
      <!-- ═══ SIDEBAR — properties, priority, actions (sticky on desktop) ═══ -->
      <aside class="w-full lg:w-[304px] shrink-0 lg:order-2 lg:sticky lg:top-4">
        <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden">
          <!-- Card ID header -->
          <div class="px-4 pt-3.5 pb-3 border-b border-muted">
            <TicketIdCopy
              :project-key="projectKey"
              :project-slug="projectSlug"
              :card-id="card.id"
              variant="pill"
            />
          </div>

          <!-- Properties. Shared with CardModal, so the same fields no longer
               get two different control vocabularies. -->
          <div class="p-3">
            <CardProperties
              v-model:status-id="selectedStatusId"
              v-model:assignee-id="selectedAssigneeId"
              v-model:priority="priority"
              v-model:due-date="selectedDueDate"
              v-model:tag-ids="selectedTagIds"
              :statuses="statusesData"
              :members="membersData"
              :tags="projectTagsData"
              :unassigned-value="UNASSIGNED"
            />
          </div>

          <!-- Provenance. The two timestamps were previously unlabelled raw
               dates stacked on each other, so you could not tell which was
               created and which was updated. -->
          <dl class="px-4 py-3 border-t border-muted flex flex-col gap-1.5 text-xs">
            <div
              v-if="card.creator"
              class="flex items-center gap-2 min-w-0"
            >
              <dt class="text-dimmed w-14 shrink-0">
                Created
              </dt>
              <dd class="min-w-0 truncate text-muted">
                <UiPerson
                  :person="card.creator"
                  size="3xs"
                />
              </dd>
            </div>
            <div
              v-if="card.createdAt"
              class="flex items-center gap-2"
            >
              <dt class="text-dimmed w-14 shrink-0">
                On
              </dt>
              <dd class="font-mono text-muted">
                <UTooltip :text="formatDate(card.createdAt)">
                  <span>{{ relativeTime(card.createdAt) }}</span>
                </UTooltip>
              </dd>
            </div>
            <div
              v-if="card.updatedAt && card.updatedAt !== card.createdAt"
              class="flex items-center gap-2"
            >
              <dt class="text-dimmed w-14 shrink-0">
                Updated
              </dt>
              <dd class="font-mono text-muted">
                <UTooltip :text="formatDate(card.updatedAt)">
                  <span>{{ relativeTime(card.updatedAt) }}</span>
                </UTooltip>
              </dd>
            </div>
          </dl>

          <!-- Actions -->
          <div class="px-4 py-3 border-t border-muted flex flex-col gap-2">
            <button
              type="submit"
              class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!title.trim() || !isDirty || saving"
            >
              <UIcon
                v-if="saving"
                name="i-lucide-loader-2"
                class="text-base animate-spin"
              />
              <template v-else>
                Save
                <kbd class="ml-2 text-xs font-mono opacity-75 bg-white/15 px-1.5 py-0.5 rounded-md">Cmd+Enter</kbd>
              </template>
            </button>

            <!-- Delete confirmation -->
            <div
              v-if="showDeleteConfirm"
              class="rounded-lg border border-error/30 bg-red-50/50 dark:bg-red-950/20 p-3 flex flex-col gap-2"
            >
              <p class="text-xs font-medium text-error leading-relaxed">
                Are you sure you want to delete this card?
              </p>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="deletingCard"
                  @click="confirmDelete"
                >
                  <UIcon
                    v-if="!deletingCard"
                    name="i-lucide-trash-2"
                    class="text-sm"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-loader-2"
                    class="text-sm animate-spin"
                  />
                  Delete
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-all"
                  @click="showDeleteConfirm = false"
                >
                  Cancel
                </button>
              </div>
            </div>

            <button
              v-else
              type="button"
              class="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-dimmed hover:text-error hover:bg-error/10 transition-all"
              @click="showDeleteConfirm = true"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-xs"
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
          class="w-full text-xl font-bold text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-accented rounded-none outline-none! ring-0! tracking-[-0.015em] leading-snug py-2 mb-4 transition-colors"
        >

        <!-- Description header -->
        <div class="flex items-center gap-1.5 mb-2">
          <UIcon
            name="i-lucide-text"
            class="text-sm text-dimmed"
          />
          <span class="text-xs font-semibold uppercase tracking-[0.04em] text-dimmed">Description</span>
          <button
            v-if="!editingDescription"
            type="button"
            class="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium text-dimmed hover:text-toned hover:bg-elevated transition-all"
            @click="startEditingDescription"
          >
            <UIcon
              name="i-lucide-pencil"
              class="text-xs"
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

        <!-- Comments -->
        <CommentList
          :card-id="card?.id"
          :members="membersData"
          :project-slug="projectSlug"
          :project-key="projectKey"
          :can-moderate="canModerateComments"
        />
      </div>
    </form>

    <!-- Unsaved changes warning -->
    <UModal
      v-model:open="showLeaveWarning"
      :ui="{ content: 'sm:max-w-[400px]', header: 'hidden', footer: 'hidden', body: 'p-0 sm:p-0' }"
    >
      <template #body>
        <div class="p-5 flex flex-col items-center text-center gap-3">
          <div class="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
            <UIcon
              name="i-lucide-triangle-alert"
              class="text-xl text-warning"
            />
          </div>
          <p class="text-base font-semibold text-highlighted">
            Unsaved changes
          </p>
          <p class="text-sm text-muted leading-relaxed">
            You have unsaved changes that will be lost if you leave this page.
          </p>
          <div class="flex items-center gap-2 mt-1 w-full">
            <button
              type="button"
              class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-toned bg-elevated hover:bg-accented transition-colors"
              @click="cancelLeave"
            >
              Stay
            </button>
            <button
              type="button"
              class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              @click="confirmLeave"
            >
              Leave
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </UiPage>
</template>
