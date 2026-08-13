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
 * Closing an existing card is unconditional.
 *
 * There used to be a second confirmation here, for text sitting in a nested
 * editor. It existed because that text had nowhere else to live — but every
 * editor on this panel now persists its draft (`useTextDraft`), so closing
 * cannot destroy anything: the description, a new comment and an in-progress
 * comment edit all come back, announced, when the card is reopened. A dialog
 * that asks permission to do something harmless is pure friction, and this one
 * was charged on every close.
 *
 * Creating still confirms, because discarding a half-made card deletes a real
 * server row that the draft mechanism knows nothing about.
 */
const open = computed({
  get: () => openModel.value,
  set: (val: boolean) => {
    if (!val && !isEdit.value && hasUnsavedWork.value) {
      // Intercept close — show discard confirmation instead
      focusBeforeConfirm.value = document.activeElement as HTMLElement | null
      showDraftDiscardConfirm.value = true
      return
    }
    openModel.value = val
  }
})

const emit = defineEmits<{
  create: [data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }]
  /** Omit `tagIds` unless tags actually changed — passing them costs a second request. */
  update: [cardId: number, updates: Record<string, unknown>, tagIds?: string[]]
  updateTags: [cardId: number, tagIds: string[]]
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
/** UButton's root *is* the <button>, so `$el` is what takes focus. */
const keepEditingRef = ref<{ $el?: HTMLElement } | null>(null)
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

/**
 * The description is the one field on an existing card that is still an explicit
 * draft, so it is the one field a close can destroy. Persisting it locally makes
 * an accidental close, a reload or a crash recoverable, which is what lets the
 * editor offer a plain Cancel rather than a confirmation.
 *
 * Explicit discard still discards — `cancelEditingDescription` clears the draft —
 * because restoring text somebody deliberately threw away is worse than losing it.
 */
const descriptionDraft = useTextDraft(
  () => (props.card ? `card:${props.card.id}:description` : null),
  description,
  () => props.card?.description || ''
)

function populateFromCard(card: NonNullable<typeof props.card>) {
  title.value = card.title || ''
  description.value = card.description || ''
  priority.value = card.priority || 'medium'
  selectedStatusId.value = card.statusId || ''
  selectedAssigneeId.value = card.assigneeId || UNASSIGNED
  selectedTagIds.value = (card.tags || []).map((t: { id: string }) => t.id)
  selectedDueDate.value = toDateInput(card.dueDate)
  editingDescription.value = false
  showDeleteConfirm.value = false
  // After the card's own text, so a draft wins over what the server holds — and
  // straight into the editor, because a restored draft rendered as prose would
  // read exactly like a saved description. That is the bug
  // `cancelEditingDescription` exists to prevent; restoring must not reintroduce it.
  descriptionDraft.load()
  if (descriptionDraft.restored.value) editingDescription.value = true
}

watch(() => props.card, (card) => {
  if (card) populateFromCard(card)
}, { immediate: true })

/**
 * Editing an existing card saves each property as it changes, matching the board
 * and the list — the same fields used to sit behind this dialog's Save button, so
 * the mental model changed depending on which surface you were on.
 *
 * Creating is still batched: there is no card to save to until Create runs.
 */
const { flushTitle } = useCardFieldSync({
  card: () => (props.card as CardFieldSyncCard | undefined) ?? null,
  fields: {
    title,
    statusId: selectedStatusId,
    assigneeId: selectedAssigneeId,
    priority,
    dueDate: selectedDueDate,
    tagIds: selectedTagIds
  },
  unassignedValue: UNASSIGNED,
  enabled: () => isEdit.value,
  save: updates => emit('update', props.card!.id, updates),
  saveTags: tagIds => emit('updateTags', props.card!.id, tagIds),
  onCardChanged: () => {
    if (props.card) populateFromCard(props.card)
  }
})

function startEditingDescription() {
  editingDescription.value = true
  nextTick(() => descriptionEditorRef.value?.startEditing())
}

/**
 * Leaving the editor without saving must not leave the typed text on screen
 * looking saved.
 *
 * It used to do exactly that: Escape only unmounted the editor, so the panel
 * rendered the *unsaved* value as prose — indistinguishable from a stored
 * description — and `hasUncommittedText`, which requires `editingDescription`,
 * went false along with it. The close guard then had nothing to warn about and
 * the text went silently.
 */
function cancelEditingDescription() {
  description.value = props.card?.description || ''
  editingDescription.value = false
  descriptionDraft.clear()
}

/**
 * What Save still has to do. Creating needs a title; editing needs something
 * genuinely pending — which, now that properties persist themselves, means the
 * description differs (or an unflushed title does).
 */
const canSubmit = computed(() => {
  if (!title.value.trim()) return false
  if (!isEdit.value) return true
  return description.value.trim() !== (props.card?.description || '').trim()
    || title.value.trim() !== (props.card?.title || '')
})

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
  // The same condition the Save button is disabled by. Without it ⌘↵ wrote and
  // closed a card nobody had edited — a redundant PUT that still moved
  // `updatedAt`, so merely reading a card and pressing ⌘↵ to dismiss it marked
  // the card as changed.
  if (!canSubmit.value || !selectedStatusId.value) return

  const assigneeId = selectedAssigneeId.value === UNASSIGNED ? null : selectedAssigneeId.value

  if (isEdit.value) {
    // Properties already saved themselves as they changed, so this commits the
    // description — the only field on an existing card that is still a draft —
    // plus any title keystrokes the debounce hasn't flushed yet.
    emit('update', props.card!.id, {
      title: title.value.trim(),
      description: description.value.trim()
    })
    editingDescription.value = false
    descriptionDraft.clear()
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

/**
 * Both remaining confirmations live in the panel's pinned footer rather than in the
 * scrolling body, which is what actually fixes the original complaint: they used to sit
 * above the actions, which on a card with comments was well below the fold, so refusing
 * to close looked like nothing happening at all. `scrollIntoView` papered over that; the
 * footer is visible by construction and needs no scrolling at all.
 *
 * Focus moves to the safe answer — it is the only way a keyboard user reaches the
 * banner without tabbing the whole panel, and backing out returns focus to wherever the
 * guard interrupted (see `restoreFocusAfterConfirm`).
 */
watch(showDraftDiscardConfirm, (shown) => {
  if (!shown) return
  nextTick(() => keepEditingRef.value?.$el?.focus())
})

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
    // The title is debounced, so closing within that window would drop the last
    // keystrokes. Closing is a commit point, not a discard.
    flushTitle()
  }
  if (!isOpen) {
    showDeleteConfirm.value = false
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
  <!--
    A right-hand slideover, not a centred dialog.

    As a 640px modal this had two structural problems. It covered the board, so reading a
    card and then moving it — the loop this app exists for — meant closing the dialog to
    see anything; and the actions lived inline at the bottom of a scrolling column, so on
    a card with comments Save and Delete were simply off-screen with nothing to say they
    were there. A panel pinned to the right leaves the board visible beside it, runs the
    full height of the viewport, and has real header and footer regions: the card's
    identity and properties stay put at the top, the actions stay put at the bottom, and
    only the content between them scrolls.

    There is no <form> element any more — one cannot span three sibling regions — so
    Enter in the title field and the Save button call `submit()` directly. Cmd+Enter was
    never the form's anyway: it is a global capture-phase listener, because portalled
    popovers break @keydown on a form (see CLAUDE.md).
  -->
  <USlideover
    v-model:open="open"
    :ui="{
      content: 'sm:max-w-[620px]',
      header: 'block',
      body: 'p-0 sm:p-0',
      footer: 'block'
    }"
  >
    <template #header>
      <!-- Identity: the card's immutable facts — its ID, its author, its permalink.
           The editable properties sit below; keeping authorship up here (rather than as
           a sixth chip among them) avoids dressing a read-only field as a dropdown. -->
      <div class="flex items-center gap-2.5 min-w-0 h-6">
        <template v-if="isEdit">
          <TicketIdCopy
            :project-key="projectKey"
            :project-slug="projectSlug"
            :card-id="card!.id"
            variant="pill"
          />
          <!-- "by" earns its place: a bare name beside the ticket ID reads as the
               assignee, which this panel also has a field for. -->
          <span
            v-if="card!.creator"
            class="flex items-baseline gap-1 min-w-0 text-xs font-medium"
          >
            <span class="text-dimmed shrink-0">by</span>
            <span class="text-muted truncate">{{ card!.creator.name }}</span>
          </span>
          <NuxtLink
            v-if="projectSlug"
            :to="`/projects/${projectSlug}/cards/${formatTicketId(projectKey, card!.id)}`"
            class="flex items-center gap-1 text-xs font-medium text-dimmed hover:text-toned transition-colors"
            aria-label="Open this card as a full page"
            @click="open = false"
          >
            <UIcon
              name="i-lucide-expand"
              class="text-base"
            />
          </NuxtLink>
        </template>
        <span
          v-else
          class="text-2xs font-semibold uppercase tracking-[0.08em] text-dimmed"
        >New card</span>

        <!-- Our own close, because overriding #header replaces the panel's default
             header content — the button included. Esc and clicking outside both route
             through the same `open` setter, so all three honour the discard guards. -->
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Close card"
          class="ml-auto -mr-1.5 shrink-0"
          @click="open = false"
        />
      </div>

      <!-- Title. Blur commits immediately rather than waiting out the debounce;
           leaving the field is an unambiguous "done typing". On a new card Enter is
           the whole create flow — type a name, press Enter, keep going. -->
      <input
        ref="titleInput"
        v-model="title"
        type="text"
        :aria-label="isEdit ? 'Card title' : 'New card title'"
        placeholder="Card title..."
        class="w-full mt-1 text-lg font-semibold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent focus:border-accented rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-1.5 transition-colors"
        @blur="flushTitle"
        @keydown.enter.prevent="isEdit ? flushTitle() : submit()"
      >

      <!-- Properties as a run of chips rather than five labelled rows. See
           CardProperties' `compact` layout for why. Pinned with the identity, so
           status and assignee stay readable while you scroll the comments. -->
      <div class="mt-2">
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
          layout="compact"
        />
      </div>
    </template>

    <template #body>
      <!-- Description -->
      <div class="px-4 sm:px-6 pt-4">
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
            :max-height="360"
          />
        </template>

        <!-- Edit mode: read-only view with edit toggle -->
        <template v-else>
          <div class="flex items-center gap-1.5 mb-1.5">
            <UIcon
              name="i-lucide-text"
              class="text-sm text-dimmed"
            />
            <span class="text-xs font-semibold uppercase tracking-[0.04em] text-dimmed">Description</span>
            <button
              v-if="!editingDescription"
              type="button"
              class="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium text-dimmed hover:text-toned hover:bg-elevated transition-colors"
              @click="startEditingDescription"
            >
              <UIcon
                name="i-lucide-pencil"
                class="text-xs"
              />
              {{ description ? 'Edit' : 'Add' }}
            </button>
          </div>

          <UiDraftNotice
            v-if="editingDescription && descriptionDraft.restored.value"
            class="mb-1.5"
            @discard="cancelEditingDescription"
          />

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
            :max-height="360"
            @escape="cancelEditingDescription"
          />
          <!-- No inner scroll box. The panel already scrolls, and a scroll area
               nested inside one traps the wheel over whichever half you happen to
               be pointing at. -->
          <div
            v-else-if="description"
            class="select-text"
          >
            <ProseDescription :content="description" />
          </div>
        </template>
      </div>

      <!-- Attachments -->
      <div class="mx-4 sm:mx-6 mt-3">
        <AttachmentList
          :card-id="attachmentCardId"
          :on-before-upload="!isEdit ? handleBeforeUpload : undefined"
        />
      </div>

      <!-- Comments: only once the card exists — there is nothing to comment on
           while creating, and attachments' draft-card trick doesn't apply here. -->
      <div
        v-if="isEdit"
        class="mx-4 sm:mx-6 pb-5"
      >
        <CommentList
          :card-id="props.card?.id"
          :members="members"
          :project-slug="projectSlug"
          :project-key="projectKey"
          :can-moderate="canModerate"
        />
      </div>
    </template>

    <template #footer>
      <!-- Delete confirmation (edit mode only) -->
      <div
        v-if="isEdit && showDeleteConfirm"
        class="mb-3 rounded-lg border border-error/30 bg-error/5 p-3 flex flex-col gap-2"
      >
        <p class="text-xs font-medium text-error leading-relaxed">
          Are you sure you want to delete this card?
        </p>
        <div class="flex items-center gap-2">
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            label="Delete"
            size="sm"
            @click="confirmDelete"
          />
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            size="sm"
            @click="showDeleteConfirm = false"
          />
        </div>
      </div>

      <!-- Draft discard confirmation (create mode with draft) -->
      <div
        v-if="showDraftDiscardConfirm"
        class="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 flex flex-col gap-2"
      >
        <p class="text-xs font-medium text-warning leading-relaxed">
          You have unsaved changes. Discard this card?
        </p>
        <div class="flex items-center gap-2">
          <UButton
            color="warning"
            icon="i-lucide-trash-2"
            label="Discard"
            size="sm"
            @click="confirmDiscardDraft"
          />
          <UButton
            ref="keepEditingRef"
            color="neutral"
            variant="ghost"
            label="Cancel"
            size="sm"
            @click="cancelDiscardDraft"
          />
        </div>
      </div>

      <!-- Actions. Destructive far left, primary last — the fixed order UiSaveBar
           established, so the same two buttons never swap places between surfaces. -->
      <div class="flex items-center gap-2">
        <UButton
          v-if="isEdit && !showDeleteConfirm"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          label="Delete"
          size="sm"
          class="mr-auto"
          @click="showDeleteConfirm = true"
        />
        <span
          v-else
          class="mr-auto"
        />
        <span class="text-2xs font-mono text-dimmed hidden sm:block">
          <kbd class="px-1 py-0.5 rounded-md bg-elevated border border-accented text-dimmed">&#8984;&#x23CE;</kbd>
        </span>
        <UButton
          :label="isEdit ? 'Save' : 'Create'"
          :icon="isEdit ? undefined : 'i-lucide-plus'"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>
