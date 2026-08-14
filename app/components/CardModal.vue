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
const titleInput = ref<HTMLTextAreaElement>()

/**
 * The title wraps instead of scrolling out of sight.
 *
 * It was an `<input>`, so a long one simply ran off the right edge of the panel
 * with no ellipsis and no way to read the rest without arrowing through it — a
 * 100-character title showed about 70 of its characters and nothing said so.
 * Enter still commits rather than inserting a newline, so it stays a single-line
 * field that happens to be able to show all of itself.
 */
function resizeTitle() {
  const el = titleInput.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(title, () => nextTick(resizeTitle))
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

const panelTop = ref<HTMLElement | null>(null)

// ─── Fade the body's edges ──────────────────────────────────────────────────
/**
 * See `.panel-scroll` in main.css for why. The mechanics are the board's, with
 * one difference: the scroll container belongs to USlideover, not to us, so it is
 * reached through the first section we render into `#body` rather than by a ref.
 *
 * The observer watches the sections as well as the container, because the height
 * that matters here changes without the panel resizing — comments arrive, the
 * description editor opens, a file is attached. Observing only the container
 * would leave the bottom fade claiming there is more to read after the last
 * comment loaded, or hiding that there is.
 */
const bodyStart = ref<HTMLElement | null>(null)
let bodyScroller: HTMLElement | null = null
let bodyObserver: ResizeObserver | null = null

function updateBodyFade() {
  const el = bodyScroller
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  el.style.setProperty('--panel-fade-top', el.scrollTop > 4 ? '28px' : '0px')
  el.style.setProperty('--panel-fade-bottom', el.scrollTop < max - 4 ? '28px' : '0px')
}

function watchBodyScroll() {
  bodyScroller = bodyStart.value?.parentElement ?? null
  if (!bodyScroller) return
  bodyScroller.addEventListener('scroll', updateBodyFade, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    bodyObserver = new ResizeObserver(updateBodyFade)
    bodyObserver.observe(bodyScroller)
    for (const section of bodyScroller.children) bodyObserver.observe(section)
  }
  updateBodyFade()
}

function unwatchBodyScroll() {
  bodyScroller?.removeEventListener('scroll', updateBodyFade)
  bodyObserver?.disconnect()
  bodyObserver = null
  bodyScroller = null
}

onUnmounted(unwatchBodyScroll)

/**
 * Opening a card must not arm the one control that leaves the board.
 *
 * Reka focuses the first tabbable element in the panel, and that is the "open as
 * a full page" link — so opening a card and pressing Enter navigated away from
 * the board you opened it from.
 *
 * Focus goes to the panel's own header instead, which is `tabindex="-1"`: it is
 * inside the focus trap, Tab from there reaches everything in order, and Enter
 * does nothing. Focusing a *button* would have worked too, but it would paint a
 * ring on every card a mouse user opened — the same failure `useMenuFocusReturn`
 * exists to prevent, and the reason not to hand focus to something operable.
 *
 * Done on `after:enter` rather than by cancelling the auto-focus: USlideover
 * doesn't forward Reka's `open-auto-focus`, so binding it looks correct and
 * silently does nothing. Creating is left alone — there the title is the whole
 * point, and `watch(open)` focuses it.
 */
function onPanelOpen() {
  watchBodyScroll()
  if (!isEdit.value) return
  panelTop.value?.focus()
}

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
 * Click the paragraph to edit it — without costing prose the two things prose is
 * for. A click that landed on a link follows the link, and a click that ends a
 * selection is somebody copying a line out, not somebody asking to rewrite it.
 *
 * This is why the rendered description is a `div` and not a `button`: a button
 * cannot legally contain the links a description routinely has, and it would
 * swallow the drag-select as a press.
 */
function onProseClick(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest('a')) return
  if (!window.getSelection()?.isCollapsed) return
  startEditingDescription()
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

/** Create needs a title and somewhere to put the card. Nothing else is batched. */
const canSubmit = computed(() => !!title.value.trim() && !!selectedStatusId.value)

const descriptionDirty = computed(() =>
  description.value.trim() !== (props.card?.description || '').trim()
)

/**
 * The description commits itself, from a button that sits under the editor it
 * belongs to.
 *
 * It used to be the panel's footer Save — a button in a different region, past
 * the attachments and every comment, sharing a row with Delete. On a card with a
 * thread that is several hundred pixels below the editor you are typing in, and
 * it is the same button whether you have written a description or not. Every
 * other field on this panel already saves where it lives; this is the last one
 * that didn't.
 *
 * Deliberately still explicit rather than autosaved. The editor is a markdown
 * textarea, so writing and reading are different modes, and a mode you leave by
 * saving is honest about that. When the editors become WYSIWYG this can become
 * a blur-and-debounce like the title.
 */
function saveDescription() {
  if (!props.card || !descriptionDirty.value) return
  emit('update', props.card.id, { description: description.value.trim() })
  editingDescription.value = false
  descriptionDraft.clear()
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

/**
 * Create only. An existing card has nothing left to batch: its properties save on
 * change, its title on blur, its description from its own button — so the panel
 * stopped carrying a Save at all rather than keeping one that is disabled for the
 * whole life of the card and enabled for the seconds between typing a description
 * and committing it.
 */
function submit() {
  if (isEdit.value || !canSubmit.value) return

  const assigneeId = selectedAssigneeId.value === UNASSIGNED ? null : selectedAssigneeId.value

  if (draftCardId.value) {
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

const cardMenuItems = computed(() => [[{
  label: 'Delete card',
  icon: 'i-lucide-trash-2',
  color: 'error' as const,
  onSelect: () => { showDeleteConfirm.value = true }
}]])

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

/**
 * ⌘↵ commits the editor you are in.
 *
 * A comment editor claims it first — that check is containment, not listener
 * order, so neither side depends on which component mounted (see CommentList).
 * Otherwise, on an existing card the only thing that can be committed is the
 * description, and on a new card the only thing is the card itself.
 *
 * Note the description branch doesn't require focus to be *inside* the editor:
 * open it, click a status, hit ⌘↵ and the intent is unambiguous, since nothing
 * else on an existing card is pending. Falling through to "nothing happens"
 * there would look like the shortcut had broken.
 */
function handleKeydown(e: KeyboardEvent) {
  if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return
  if ((e.target as HTMLElement | null)?.closest?.('[data-comment-editor]')) return

  if (isEdit.value) {
    if (!editingDescription.value) return
    e.preventDefault()
    e.stopImmediatePropagation()
    saveDescription()
    return
  }

  e.preventDefault()
  e.stopImmediatePropagation()
  submit()
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
      // The board publishes `--card-panel-w` from its own geometry when it
      // reveals a column; Tailwind needs the class as a build-time literal, so
      // the value arrives as a custom property. The fallback is what surfaces
      // without a board — a list, My Tasks — and any window too narrow for the
      // reveal get.
      content: 'sm:max-w-[var(--card-panel-w,620px)]',
      header: 'block',
      body: 'p-0 sm:p-0 panel-scroll',
      footer: 'block'
    }"
    @after:enter="onPanelOpen"
    @after:leave="unwatchBodyScroll"
  >
    <template #header>
      <!-- Identity: the card's immutable facts — its ID, its author, its permalink.
           The editable properties sit below; keeping authorship up here (rather than as
           a sixth chip among them) avoids dressing a read-only field as a dropdown. -->
      <!-- `outline-none!` with the bang, which is why the title fields below
           carry one too: the app's focus ring is an *unlayered* `:focus-visible`
           rule in main.css, and unlayered CSS beats Tailwind's layered utilities
           whatever their specificity. Only `!important` gets past it. A
           `tabindex="-1"` container is never a keyboard destination, so it never
           wants the ring. -->
      <div
        ref="panelTop"
        tabindex="-1"
        class="flex items-center gap-2.5 min-w-0 h-6 outline-none!"
      >
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

        <!-- Card-level actions. Delete lives here rather than in the footer
             because the footer is gone on an existing card: with the description
             committing itself there is no Save to sit beside, and a pinned bar
             holding one destructive button is a bar that exists to hold a
             destructive button. -->
        <UDropdownMenu
          v-if="isEdit"
          :items="cardMenuItems"
          :content="FIELD_MENU_ALIGN_END"
        >
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Card actions"
            class="ml-auto shrink-0"
          />
        </UDropdownMenu>

        <!-- Our own close, because overriding #header replaces the panel's default
             header content — the button included. Esc and clicking outside both route
             through the same `open` setter, so all three honour the discard guards. -->
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Close card"
          class="-mr-1.5 shrink-0"
          :class="isEdit ? '' : 'ml-auto'"
          @click="open = false"
        />
      </div>

      <!-- Title. Blur commits immediately rather than waiting out the debounce;
           leaving the field is an unambiguous "done typing". On a new card Enter is
           the whole create flow — type a name, press Enter, keep going. -->
      <textarea
        ref="titleInput"
        v-model="title"
        rows="1"
        :aria-label="isEdit ? 'Card title' : 'New card title'"
        placeholder="Card title..."
        class="w-full mt-1 text-lg font-semibold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent focus:border-accented rounded-none outline-none! ring-0! tracking-[-0.01em] leading-snug py-1.5 transition-colors resize-none overflow-hidden"
        @input="resizeTitle"
        @blur="flushTitle"
        @keydown.enter.prevent="isEdit ? flushTitle() : submit()"
      />

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
      <!-- Description. Carries the ref that reaches the scroll container — see
           `watchBodyScroll`; USlideover owns that element, not us. -->
      <div
        ref="bodyStart"
        class="px-4 sm:px-6 pt-4"
      >
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
            <UiSectionLabel
              label="Description"
              icon="i-lucide-text"
            />
            <!-- Only when there is something to edit. With the description empty
                 its own placeholder is the affordance, and two invitations to
                 write the same paragraph — a 19px ghost button up here and a
                 full-width target below — is one too many. -->
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

          <div v-if="editingDescription">
            <UiDraftNotice
              v-if="descriptionDraft.restored.value"
              class="mb-1.5"
              @discard="cancelEditingDescription"
            />

            <DescriptionEditor
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

            <!-- The description's own commit, under the editor it belongs to.
                 Same shape as the comment composer's, because they are the same
                 act: write prose, then decide to keep it. -->
            <div class="flex items-center gap-2 mt-2">
              <UButton
                size="xs"
                :disabled="!descriptionDirty"
                @click="saveDescription"
              >
                Save
                <UKbd value="meta" />
                <UKbd value="enter" />
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Cancel"
                @click="cancelEditingDescription"
              />
            </div>
          </div>

          <!-- No inner scroll box. The panel already scrolls, and a scroll area
               nested inside one traps the wheel over whichever half you happen to
               be pointing at.

               The prose is the edit target. Hunting for a 19px "Edit" button to
               change a paragraph you are already looking at is the mode showing
               through; clicking the thing you want to change is not. The button
               stays for discoverability and for keyboard reach. -->
          <div
            v-else-if="description"
            class="select-text rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-muted/60 transition-colors"
            @click="onProseClick"
          >
            <ProseDescription :content="description" />
          </div>

          <!-- Empty: the placeholder is the button. A heading with a void under
               it reads as a section that failed to render, and it is what the
               panel used to show — twice over, since attachments did the same
               thing an inch below. -->
          <button
            v-else
            type="button"
            class="w-full rounded-lg border border-dashed border-default px-3 py-2 text-left text-sm text-dimmed hover:border-accented hover:bg-muted transition-colors"
            @click="startEditingDescription"
          >
            Add a description…
          </button>
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

    <!--
      Edit mode has no footer at all. Properties save on change, the title on
      blur, the description from its own button — so a pinned action bar would
      hold nothing but Delete, and Delete belongs with the card's other
      card-level actions in the header menu. The body gains the height back.
    -->
    <template
      v-if="!isEdit"
      #footer
    >
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

      <div class="flex items-center justify-end">
        <UButton
          label="Create"
          icon="i-lucide-plus"
          :disabled="!canSubmit"
          @click="submit"
        >
          <template #trailing>
            <UKbd value="meta" />
            <UKbd value="enter" />
          </template>
        </UButton>
      </div>
    </template>
  </USlideover>

  <!-- One destructive idiom, the one CLAUDE.md names. No `confirmText`: a card is
       cheap to recreate, so it is a single click rather than type-the-name.

       A sibling of the slideover, never a child: USlideover's default slot is its
       *trigger*, so a dialog placed there renders into the page behind the panel —
       centred, with its buttons under the panel's left edge and unclickable. -->
  <UiConfirmDialog
    v-model:open="showDeleteConfirm"
    title="Delete this card?"
    description="Its comments and attachments go with it. This cannot be undone."
    action-label="Delete card"
    @confirm="confirmDelete"
  />
</template>
