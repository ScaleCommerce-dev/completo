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

useSeoMeta({
  title: () => card.value
    ? `${formatTicketId(projectKey.value, card.value.id)} ${card.value.title} · Completo`
    : 'Completo'
})

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
const titleInput = ref<HTMLTextAreaElement>()

/** See CardModal — the title wraps instead of scrolling out of sight. */
function resizeTitle() {
  const el = titleInput.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(title, () => nextTick(resizeTitle))

const selectedTagNames = computed(() => (projectTagsData.value || []).filter(t => selectedTagIds.value.includes(t.id)).map(t => t.name))

// Sync from fetched data once loaded
const synced = ref(false)

/** See CardModal — the description is the one field a navigation can destroy. */
const descriptionDraft = useTextDraft(
  () => (card.value ? `card:${card.value.id}:description` : null),
  description,
  () => card.value?.description || ''
)

function populateFromCard(c: CardDetail) {
  title.value = c.title || ''
  description.value = c.description || ''
  priority.value = c.priority || 'medium'
  selectedStatusId.value = c.statusId || ''
  selectedAssigneeId.value = c.assigneeId || UNASSIGNED
  selectedTagIds.value = (c.tags || []).map(t => t.id)
  selectedDueDate.value = toDateInput(c.dueDate)
  // See CardModal: restoring into the read view would render unsaved text as if
  // it were stored, so a restored draft opens the editor it belongs to.
  descriptionDraft.load()
  if (descriptionDraft.restored.value) editingDescription.value = true
}

watch(card, (c) => {
  if (c && !synced.value) {
    populateFromCard(c)
    synced.value = true
  }
}, { immediate: true })

/**
 * Properties save as they change, matching the board, the list and the card
 * modal. Save is left holding the description, which is the only field here that
 * is genuinely a draft.
 *
 * `cardData` is patched locally from each response so the composable's own
 * divergence checks stay accurate without a refetch — and so a rejected save
 * snaps the control back to what the server actually holds.
 */
async function persist(updates: Record<string, unknown>) {
  if (!card.value) return
  const id = card.value.id
  try {
    const updated = await $fetch<Partial<CardDetail>>(`/api/cards/${id}`, { method: 'PUT', body: updates })
    if (updated) cardData.value = { ...cardData.value, ...updated } as CardDetail
  } catch (e: unknown) {
    useToast().add({ title: 'Failed to save', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
    // Re-assign so the sync watcher fires and pulls the controls back.
    cardData.value = { ...cardData.value } as CardDetail
    syncProperties()
  }
}

async function persistTags(tagIds: string[]) {
  if (!card.value) return
  const id = card.value.id
  try {
    const result = await $fetch<{ tags: CardDetail['tags'] }>(`/api/cards/${id}/tags`, {
      method: 'PUT',
      body: { tagIds }
    })
    cardData.value = { ...cardData.value, tags: result.tags } as CardDetail
  } catch (e: unknown) {
    useToast().add({ title: 'Failed to update tags', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
    syncProperties()
  }
}

const { flushTitle, syncProperties } = useCardFieldSync({
  card: () => (card.value as CardFieldSyncCard | undefined) ?? null,
  fields: {
    title,
    statusId: selectedStatusId,
    assigneeId: selectedAssigneeId,
    priority,
    dueDate: selectedDueDate,
    tagIds: selectedTagIds
  },
  unassignedValue: UNASSIGNED,
  enabled: () => synced.value && !!card.value,
  save: persist,
  saveTags: persistTags,
  onCardChanged: () => {
    if (card.value) populateFromCard(card.value)
  }
})

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

/**
 * Same contract as CardModal: leaving the editor reverts, so the page never
 * renders unsaved text as if it were stored. The draft survives an accidental
 * navigation; an explicit cancel clears it.
 */
function cancelEditingDescription() {
  description.value = card.value?.description || ''
  editingDescription.value = false
  descriptionDraft.clear()
}

const descriptionDirty = computed(() =>
  description.value.trim() !== (card.value?.description || '').trim()
)

/**
 * Leaving is unconditional, as it is on the card panel.
 *
 * This page used to hold a route guard, a modal and a `beforeunload` handler for
 * text that had nowhere to live. It lives somewhere now: the description is
 * drafted locally as it is typed and comes back, announced, when the card is
 * reopened — on this page or in the panel, since both key the draft to the card
 * rather than the surface. The title is debounced rather than a draft, so it is
 * still flushed on the way out; that is a commit, not a question.
 */
onBeforeRouteLeave(() => {
  flushTitle()
})

/**
 * ⌘↵ commits the editor you are in — see CardModal for the routing. A comment
 * editor claims it first; otherwise it belongs to the description, which is the
 * only thing on this page that is still explicitly saved.
 */
function handleKeydown(e: KeyboardEvent) {
  if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return
  if ((e.target as HTMLElement | null)?.closest?.('[data-comment-editor]')) return
  if (!editingDescription.value) return
  e.preventDefault()
  e.stopImmediatePropagation()
  submit()
}

onMounted(() => document.addEventListener('keydown', handleKeydown, true))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown, true))

/**
 * Commits the description, from the button under the editor it belongs to. The
 * properties this used to send save the moment they change, and the title saves
 * on blur, so this is the last field on the page that is still a draft.
 */
async function submit() {
  if (!card.value || !descriptionDirty.value) return
  saving.value = true
  try {
    await persist({ description: description.value.trim() })
    editingDescription.value = false
    descriptionDraft.clear()
  } finally {
    saving.value = false
  }
}

/** See CardModal — click the prose, but never at the cost of a link or a selection. */
function onProseClick(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest('a')) return
  if (!window.getSelection()?.isCollapsed) return
  startEditingDescription()
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

    <!-- Card detail: two-panel layout. Not a <form> any more — there is no submit
         button left to own, since every field commits itself and the description
         commits from the button beside its editor. -->
    <div
      v-else-if="card"
      class="flex flex-col lg:flex-row gap-6 lg:items-start"
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

          <!-- Actions. No Save: every field here commits itself, and the
               description commits from the button under its own editor. What is
               left is the one action that isn't a field. -->
          <div class="px-4 py-3 border-t border-muted">
            <UButton
              label="Delete card"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              block
              @click="showDeleteConfirm = true"
            />
          </div>
        </div>
      </aside>

      <!-- ═══ MAIN CONTENT — title + description ═══ -->
      <div class="flex-1 min-w-0 lg:order-1">
        <!-- Title -->
        <!-- A textarea, so a long title wraps rather than running off the edge.
             See CardModal — Enter still commits. -->
        <textarea
          ref="titleInput"
          v-model="title"
          rows="1"
          aria-label="Card title"
          placeholder="Card title..."
          class="w-full text-xl font-bold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent focus:border-accented rounded-none outline-none! ring-0! tracking-[-0.015em] leading-snug py-2 mb-4 transition-colors resize-none overflow-hidden"
          @input="resizeTitle"
          @blur="flushTitle"
          @keydown.enter.prevent="flushTitle"
        />

        <!-- Description header -->
        <div class="flex items-center gap-1.5 mb-2">
          <UiSectionLabel
            label="Description"
            icon="i-lucide-text"
          />
          <!-- See CardModal: with no description, its placeholder is the button. -->
          <UButton
            v-if="!editingDescription && description"
            icon="i-lucide-pencil"
            label="Edit"
            color="neutral"
            variant="ghost"
            size="xs"
            class="ml-auto"
            @click="startEditingDescription"
          />
        </div>

        <!-- Description: edit mode -->
        <UiDraftNotice
          v-if="editingDescription && descriptionDraft.restored.value"
          class="mb-1.5"
          @discard="cancelEditingDescription"
        />

        <template v-if="editingDescription">
          <DescriptionEditor
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
            @escape="cancelEditingDescription"
          />

          <div class="flex items-center gap-2 mt-2">
            <UButton
              size="xs"
              :loading="saving"
              :disabled="!descriptionDirty"
              @click="submit"
            >
              Save
              <UiKey value="meta" />
              <UiKey value="enter" />
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="cancelEditingDescription"
            />
          </div>
        </template>

        <!-- Description: read mode. The prose is the edit target; see CardModal. -->
        <div
          v-else-if="description"
          class="select-text rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-muted/60 transition-colors"
          @click="onProseClick"
        >
          <ProseDescription :content="description" />
        </div>

        <button
          v-else
          type="button"
          class="w-full rounded-lg border border-dashed border-default px-3 py-2 text-left text-sm text-dimmed hover:border-accented hover:bg-muted transition-colors"
          @click="startEditingDescription"
        >
          Add a description…
        </button>

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
    </div>

    <!-- The one destructive idiom, shared with the card panel. -->
    <UiConfirmDialog
      v-model:open="showDeleteConfirm"
      title="Delete this card?"
      description="Its comments and attachments go with it. This cannot be undone."
      action-label="Delete card"
      :loading="deletingCard"
      @confirm="confirmDelete"
    />
  </UiPage>
</template>
