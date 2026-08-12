<script setup lang="ts">
import type { BaseCard, CardStatus, Member, Tag } from '~/types/card'

const props = defineProps<{
  card?: Pick<BaseCard, 'id' | 'title' | 'description' | 'priority' | 'statusId' | 'assigneeId' | 'dueDate' | 'creator'> & { tags?: Tag[] }
  statuses: CardStatus[]
  members?: Member[]
  tags?: Tag[]
  statusId?: string
  projectKey?: string
  projectSlug?: string
  /** Viewer may delete others' comments (project owner or instance admin). */
  canModerate?: boolean
  onEnsureCard?: (data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }) => Promise<number>
}>()

const openModel = defineModel<boolean>('open', { default: false })

const hasUnsavedWork = computed(() =>
  !!title.value.trim()
  || !!description.value.trim()
  || selectedTagIds.value.length > 0
  || selectedAssigneeId.value !== UNASSIGNED
  || selectedDueDate.value !== null
  || priority.value !== 'medium'
  || !!draftCardId.value
)

/**
 * Text typed into a nested editor that hasn't been committed anywhere.
 *
 * Unlike the fields in the properties grid, this content has no other home: closing the
 * modal unmounts the editor and it's gone. Deliberately narrower than "the form is dirty"
 * — a changed status or priority is one click to redo and shows its own state, so it
 * doesn't earn a confirmation.
 */
const hasUncommittedText = computed(() => {
  if (commentListRef.value?.hasUnsavedDraft) return true
  return editingDescription.value
    && description.value.trim() !== (props.card?.description || '').trim()
})

const open = computed({
  get: () => openModel.value,
  set: (val: boolean) => {
    if (!val && !isEdit.value && hasUnsavedWork.value) {
      // Intercept close — show discard confirmation instead
      focusBeforeConfirm.value = document.activeElement as HTMLElement | null
      showDraftDiscardConfirm.value = true
      return
    }
    // Esc no longer escapes an editor (see DescriptionEditor), but clicking outside and
    // the close button still land here — and would silently take the text with them.
    if (!val && isEdit.value && hasUncommittedText.value) {
      focusBeforeConfirm.value = document.activeElement as HTMLElement | null
      showTextDiscardConfirm.value = true
      return
    }
    openModel.value = val
  }
})

const emit = defineEmits<{
  create: [data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }]
  update: [cardId: number, updates: Record<string, unknown>, tagIds: string[]]
  delete: [cardId: number]
  deleteDraft: [cardId: number]
}>()

const isEdit = computed(() => !!props.card)

const title = ref('')
const description = ref('')
const priority = ref('medium')
const selectedStatusId = ref('')
const UNASSIGNED = '__unassigned__'
const selectedAssigneeId = ref(UNASSIGNED)
const selectedTagIds = ref<string[]>([])
const selectedDueDate = ref<string | null>(null)
const editingDescription = ref(false)
const titleInput = ref<HTMLInputElement>()
const descriptionEditorRef = ref<{ startEditing: () => void }>()
const showDeleteConfirm = ref(false)
const draftCardId = ref<number | null>(null)
const showDraftDiscardConfirm = ref(false)
const showTextDiscardConfirm = ref(false)
const commentListRef = ref<{ hasUnsavedDraft: boolean }>()
const confirmBannerRef = ref<HTMLElement>()
const keepEditingRef = ref<HTMLButtonElement>()
/**
 * Where focus was when a confirmation interrupted, so backing out returns it there.
 * Without this, dismissing the banner unmounts the focused button and focus falls to
 * <body> — which silently re-routes Cmd+Enter to the card instead of the comment editor
 * it came from (see the containment note in CLAUDE.md).
 */
const focusBeforeConfirm = ref<HTMLElement | null>(null)

function restoreFocusAfterConfirm() {
  const el = focusBeforeConfirm.value
  focusBeforeConfirm.value = null
  nextTick(() => el?.focus())
}

const selectedTagNames = computed(() => (props.tags || []).filter(t => selectedTagIds.value.includes(t.id)).map(t => t.name))

const attachmentCardId = computed(() => draftCardId.value ?? props.card?.id ?? null)

function getFormData() {
  const assigneeId = selectedAssigneeId.value === UNASSIGNED ? null : selectedAssigneeId.value
  return {
    title: title.value.trim() || 'Untitled',
    description: description.value.trim(),
    priority: priority.value,
    statusId: selectedStatusId.value,
    assigneeId,
    tagIds: selectedTagIds.value,
    dueDate: selectedDueDate.value || null
  }
}

let ensureCardPromise: Promise<void> | null = null

async function handleBeforeUpload() {
  if (draftCardId.value || !props.onEnsureCard) return
  if (ensureCardPromise) {
    await ensureCardPromise
    return
  }
  ensureCardPromise = props.onEnsureCard(getFormData()).then((id) => {
    draftCardId.value = id
  })
  await ensureCardPromise
  ensureCardPromise = null
}

// Sync from card prop (edit mode)
watch(() => props.card, (card) => {
  if (card) {
    title.value = card.title || ''
    description.value = card.description || ''
    priority.value = card.priority || 'medium'
    selectedStatusId.value = card.statusId || ''
    selectedAssigneeId.value = card.assigneeId || UNASSIGNED
    selectedTagIds.value = (card.tags || []).map((t: { id: string }) => t.id)
    selectedDueDate.value = card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] ?? null : null
    editingDescription.value = false
    showDeleteConfirm.value = false
  }
}, { immediate: true })

function startEditingDescription() {
  editingDescription.value = true
  nextTick(() => descriptionEditorRef.value?.startEditing())
}

function reset() {
  title.value = ''
  description.value = ''
  priority.value = 'medium'
  selectedAssigneeId.value = UNASSIGNED
  selectedTagIds.value = []
  selectedDueDate.value = null
  editingDescription.value = false
  showDeleteConfirm.value = false
  draftCardId.value = null
  showDraftDiscardConfirm.value = false
}

function submit() {
  if (!title.value.trim() || !selectedStatusId.value) return

  const assigneeId = selectedAssigneeId.value === UNASSIGNED ? null : selectedAssigneeId.value

  if (isEdit.value) {
    emit('update', props.card!.id, {
      title: title.value.trim(),
      description: description.value.trim(),
      priority: priority.value,
      statusId: selectedStatusId.value,
      assigneeId,
      dueDate: selectedDueDate.value || null
    }, selectedTagIds.value)
  } else if (draftCardId.value) {
    // Draft was auto-created for attachments — update it with final form data
    emit('update', draftCardId.value, {
      title: title.value.trim(),
      description: description.value.trim(),
      priority: priority.value,
      statusId: selectedStatusId.value,
      assigneeId,
      dueDate: selectedDueDate.value || null
    }, selectedTagIds.value)
    reset()
  } else {
    emit('create', {
      title: title.value.trim(),
      description: description.value.trim(),
      priority: priority.value,
      statusId: selectedStatusId.value,
      assigneeId,
      tagIds: selectedTagIds.value,
      dueDate: selectedDueDate.value || null
    })
    reset()
  }

  open.value = false
}

function confirmDelete() {
  if (!props.card) return
  showDeleteConfirm.value = false
  emit('delete', props.card.id)
}

function confirmDiscardDraft() {
  const id = draftCardId.value
  showDraftDiscardConfirm.value = false
  draftCardId.value = null
  if (id) emit('deleteDraft', id)
  openModel.value = false
  // reset() is called by the watch(open) handler when openModel becomes false
}

function cancelDiscardDraft() {
  showDraftDiscardConfirm.value = false
  restoreFocusAfterConfirm()
}

/** Names what's actually at risk, so the warning isn't guesswork for the reader. */
const uncommittedTextLabel = computed(() => {
  const hasComment = !!commentListRef.value?.hasUnsavedDraft
  const hasDescription = editingDescription.value
    && description.value.trim() !== (props.card?.description || '').trim()
  if (hasComment && hasDescription) return 'You have an unposted comment and an unsaved description.'
  if (hasComment) return 'You have an unposted comment.'
  return 'Your description edit isn\'t saved yet.'
})

/**
 * Both confirmations sit above the actions, which on a card with comments is well below
 * the fold — so refusing to close looked like nothing happening at all. Bring the banner
 * into view and put focus on the safe answer, which is also the only way a keyboard user
 * reaches it without tabbing through the whole form. The two banners are mutually
 * exclusive (one is create-mode, one edit-mode), so they can share the ref.
 */
watch([showTextDiscardConfirm, showDraftDiscardConfirm], ([text, draft]) => {
  if (!text && !draft) return
  nextTick(() => {
    confirmBannerRef.value?.scrollIntoView({ block: 'center' })
    keepEditingRef.value?.focus()
  })
})

function confirmDiscardText() {
  showTextDiscardConfirm.value = false
  openModel.value = false
}

function cancelDiscardText() {
  showTextDiscardConfirm.value = false
  restoreFocusAfterConfirm()
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

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeydown, true)
    // Sync statusId prop for create mode
    if (!isEdit.value && props.statusId) {
      selectedStatusId.value = props.statusId
    }
  } else {
    document.removeEventListener('keydown', handleKeydown, true)
  }
  if (!isOpen) {
    showDeleteConfirm.value = false
    showTextDiscardConfirm.value = false
    if (!isEdit.value) {
      reset()
    }
  }
  if (isOpen && !isEdit.value) {
    nextTick(() => titleInput.value?.focus())
  }
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{
      content: 'sm:max-w-[640px]',
      header: 'hidden',
      body: 'p-0 sm:p-0',
      footer: 'p-0 sm:p-0'
    }"
  >
    <template #body>
      <form
        class="flex flex-col"
        @submit.prevent="submit"
      >
        <!-- Identity: the card's immutable facts — its ID, its author, its permalink.
             The editable properties live in the grid below; keeping authorship up here
             (rather than as a fifth chip in that grid) avoids dressing a read-only field
             as one of the dropdowns. -->
        <div
          v-if="isEdit"
          class="flex items-center justify-between gap-3 px-5 pt-5 pb-2"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <TicketIdCopy
              :project-key="projectKey"
              :project-slug="projectSlug"
              :card-id="card!.id"
              variant="pill"
            />
            <!-- "by" earns its place: a bare name beside the ticket ID reads as the
                 assignee, which this modal also has a field for. -->
            <span
              v-if="card!.creator"
              class="flex items-baseline gap-1 min-w-0 text-xs font-medium"
            >
              <span class="text-dimmed shrink-0">by</span>
              <span class="text-muted truncate">{{ card!.creator.name }}</span>
            </span>
          </div>
          <NuxtLink
            v-if="projectSlug"
            :to="`/projects/${projectSlug}/cards/${formatTicketId(projectKey, card!.id)}`"
            class="flex items-center gap-1 text-xs font-medium text-dimmed hover:text-toned transition-colors"
            @click="open = false"
          >
            <UIcon
              name="i-lucide-expand"
              class="text-base"
            />
          </NuxtLink>
        </div>

        <!-- Title input -->
        <div :class="isEdit ? 'px-5 pb-1' : 'px-5 pt-5 pb-1'">
          <input
            ref="titleInput"
            v-model="title"
            type="text"
            placeholder="Card title..."
            class="w-full text-lg font-semibold text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b border-transparent focus:border-accented rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-2 transition-colors"
          >
        </div>

        <!-- Description -->
        <div class="px-5 pt-1">
          <!-- Create mode: always show editor -->
          <template v-if="!isEdit">
            <DescriptionEditor
              ref="descriptionEditorRef"
              v-model="description"
              :title="title"
              :tags="selectedTagNames"
              :priority="priority"
              :project-slug="projectSlug"
              :project-key="projectKey"
              :members="members"
              :card-id="attachmentCardId"
              :min-height="120"
              :max-height="300"
            />
          </template>

          <!-- Edit mode: read-only view with edit toggle -->
          <template v-else>
            <!-- Description label + edit button -->
            <div class="flex items-center gap-1.5 mb-1.5">
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

            <DescriptionEditor
              v-if="editingDescription"
              ref="descriptionEditorRef"
              v-model="description"
              :title="title"
              :tags="selectedTagNames"
              :priority="priority"
              :project-slug="projectSlug"
              :project-key="projectKey"
              :members="members"
              :card-id="card?.id"
              :min-height="120"
              :max-height="300"
              @escape="editingDescription = false"
            />
            <div
              v-else-if="description"
              class="max-h-[300px] overflow-y-auto select-text"
            >
              <ProseDescription :content="description" />
            </div>
          </template>
        </div>

        <!-- Properties. One control vocabulary, shared with the card detail
             page — this was a 2x2 grid mixing two USelects with two hand-rolled
             buttons at different heights. -->
        <div class="mx-5 mt-3">
          <CardProperties
            v-model:status-id="selectedStatusId"
            v-model:assignee-id="selectedAssigneeId"
            v-model:priority="priority"
            v-model:due-date="selectedDueDate"
            v-model:tag-ids="selectedTagIds"
            :statuses="statuses"
            :members="members"
            :tags="tags"
            :unassigned-value="UNASSIGNED"
          />
        </div>

        <!-- Attachments -->
        <div class="mx-5 mt-3">
          <AttachmentList
            :card-id="attachmentCardId"
            :on-before-upload="!isEdit ? handleBeforeUpload : undefined"
          />
        </div>

        <!-- Comments: only once the card exists — there is nothing to comment on
             while creating, and attachments' draft-card trick doesn't apply here. -->
        <div
          v-if="isEdit"
          class="mx-5"
        >
          <CommentList
            ref="commentListRef"
            :card-id="props.card?.id"
            :members="members"
            :project-slug="projectSlug"
            :project-key="projectKey"
            :can-moderate="canModerate"
          />
        </div>

        <!-- Delete confirmation (edit mode only) -->
        <div
          v-if="isEdit && showDeleteConfirm"
          class="mx-5 mt-3 rounded-lg border border-error/30 bg-red-50/50 dark:bg-red-950/20 p-3 flex flex-col gap-2"
        >
          <p class="text-xs font-medium text-error leading-relaxed">
            Are you sure you want to delete this card?
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all"
              @click="confirmDelete"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-sm"
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

        <!-- Uncommitted text confirmation (edit mode) -->
        <div
          v-if="isEdit && showTextDiscardConfirm"
          ref="confirmBannerRef"
          class="mx-5 mt-3 rounded-lg border border-orange-200/60 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/20 p-3 flex flex-col gap-2"
        >
          <p class="text-xs font-medium text-warning leading-relaxed">
            {{ uncommittedTextLabel }} Closing the card discards it.
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition-all"
              @click="confirmDiscardText"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-sm"
              />
              Discard and close
            </button>
            <button
              ref="keepEditingRef"
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-all"
              @click="cancelDiscardText"
            >
              Keep editing
            </button>
          </div>
        </div>

        <!-- Draft discard confirmation (create mode with draft) -->
        <div
          v-if="showDraftDiscardConfirm"
          ref="confirmBannerRef"
          class="mx-5 mt-3 rounded-lg border border-orange-200/60 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/20 p-3 flex flex-col gap-2"
        >
          <p class="text-xs font-medium text-warning leading-relaxed">
            You have unsaved changes. Discard this card?
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition-all"
              @click="confirmDiscardDraft"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-sm"
              />
              Discard
            </button>
            <button
              ref="keepEditingRef"
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-all"
              @click="cancelDiscardDraft"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 px-5 pt-4 pb-5 mt-4 border-t border-muted">
          <button
            v-if="isEdit && !showDeleteConfirm"
            type="button"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-error hover:bg-error/10 transition-all mr-auto"
            @click="showDeleteConfirm = true"
          >
            <UIcon
              name="i-lucide-trash-2"
              class="text-sm"
            />
            Delete
          </button>
          <span class="text-2xs font-mono text-dimmed hidden sm:block">
            <kbd class="px-1 py-0.5 rounded-md bg-elevated border border-accented text-dimmed">&#8984;&#x23CE;</kbd>
          </span>
          <UButton
            type="submit"
            :label="isEdit ? 'Save' : 'Create'"
            :icon="isEdit ? undefined : 'i-lucide-plus'"
            :disabled="!title.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
