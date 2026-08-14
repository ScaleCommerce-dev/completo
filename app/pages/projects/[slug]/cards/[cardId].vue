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

/**
 * A file dropped anywhere on the card attaches it — see `useFileDrop`, and note
 * that until this existed a file dropped outside the attachments section made the
 * browser navigate to `file:///…` and leave the page.
 */
const dropRoot = ref<HTMLElement | null>(null)
const attachmentsRef = ref<{ uploadFiles: (files: File[]) => Promise<void> } | null>(null)

const { dragging } = useFileDrop({
  root: () => dropRoot.value,
  enabled: () => !!card.value,
  onFiles: files => attachmentsRef.value?.uploadFiles(files)
})

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

/**
 * See CardModal for why clicking the prose no longer edits it, and why copying
 * the markdown is the control that replaced the gesture it was breaking.
 */
const { copied: descriptionCopied, copy: copyText } = useCopyText()

function copyDescription() {
  copyText(description.value)
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
    <!--
      The breadcrumb's last crumb *is* the ticket ID control.

      The rail used to carry a copyable `TK-27` pill in a bordered section of its
      own, 60px below a breadcrumb already ending in `TK-27` — the page stated the
      same identifier twice, and only the further-away one could be clicked. The
      pill earns its place on the card *panel*, which has no breadcrumb; here the
      breadcrumb is where the eye already reads the number, so the copy goes there
      and the section goes away.
    -->
    <template #title>
      <UBreadcrumb
        :items="[
          { label: cardData?.project?.name || '', to: `/projects/${projectSlug}`, icon: 'i-lucide-folder' },
          { label: card ? formatTicketId(projectKey, card.id) : '', icon: 'i-lucide-square-check-big' }
        ]"
      >
        <template #item-label="{ item, index }">
          <TicketIdCopy
            v-if="index === 1 && card"
            :project-key="projectKey"
            :project-slug="projectSlug"
            :card-id="card.id"
            :copy-buttons="false"
          />
          <span v-else>{{ item.label }}</span>
        </template>
      </UBreadcrumb>
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
      <!--
        One card, one stack of rows, one inset.

        It was four sections at three different insets, two label idioms and two
        kinds of box. The properties were a *bordered group inside the bordered
        card*, so their labels sat 25px from the card's edge while the provenance
        rows beneath them sat at 16 and visibly failed to line up; the provenance
        rows carried a 56px label column and no icons where the properties had
        icons and a 74px one; and the ticket ID had a whole bordered section to
        itself for one chip, 60px below the breadcrumb that already says `TK-27`.

        Now every row in the rail is the same row: an icon, a label in the same
        column, a value. What separates the card's *fields* from *facts about the
        card* is that a fact has no chevron — the same trick the empty rows in the
        main column use, where one vocabulary is differentiated by content rather
        than by chrome.
      -->
      <!-- `order-2`, not `lg:order-2`. The aside comes first in the DOM so that it
           can be the right-hand column on a wide screen, and the order was only
           being set at `lg` — so below that breakpoint the DOM order stood and a
           phone was shown the properties card and a Delete button *above* the
           card's own title. The title leads at every width. -->
      <aside class="w-full lg:w-[304px] shrink-0 order-2 lg:sticky lg:top-4">
        <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden divide-y divide-default">
          <!-- Properties. Shared with CardModal, so the same fields no longer
               get two different control vocabularies. Draws its own hairlines
               and no border — see CardProperties. -->
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

          <!--
            Provenance, as two facts rather than three rows.

            It was Created / On / Updated, where "Created" held a *person* and "On"
            held a date — one fact split across two rows, the second of which
            needed a filler label because the first had taken the real one. Who
            made the card and when is one thing and reads as one line.

            The times are no longer monospace either. Mono is for values you
            compare character by character — a ticket ID, a file size, a count —
            and "5mo ago" is prose; the comment timestamps six inches to the left
            were already setting it in the body face.
          -->
          <div class="divide-y divide-default">
            <UiFieldRow
              label="Created"
              icon="i-lucide-user-plus"
            >
              <!-- A gap and a step down in colour, no middot: that is already how
                   a comment header sets a name against its timestamp six inches to
                   the left, and one separator idiom on a page is enough. -->
              <span class="flex items-center gap-2 min-w-0">
                <UiPerson
                  v-if="card.creator"
                  :person="card.creator"
                  size="3xs"
                />
                <UTooltip :text="formatTimestamp(card.createdAt)">
                  <span
                    class="text-sm shrink-0"
                    :class="card.creator ? 'text-dimmed' : 'text-muted'"
                  >{{ relativeTime(card.createdAt) }}</span>
                </UTooltip>
              </span>
            </UiFieldRow>

            <UiFieldRow
              v-if="card.updatedAt && card.updatedAt !== card.createdAt"
              label="Updated"
              icon="i-lucide-history"
            >
              <UTooltip :text="formatTimestamp(card.updatedAt)">
                <span class="text-sm text-muted">{{ relativeTime(card.updatedAt) }}</span>
              </UTooltip>
            </UiFieldRow>
          </div>

          <!--
            The last row of the stack, not a button floating under the card.

            It was a bare ghost-error button below the card, and it had both
            problems at once: unanchored — belonging to nothing, its icon 6px off
            the column of seven icons directly above it — and red text on a bare
            page reads as an error *message* rather than as a control.

            As a row it inherits the grid: same height, same 16px inset, icon on
            the same line. And it is **grey at rest and red on hover**, so the one
            destructive thing on the page announces itself at the moment you reach
            for it rather than the whole time you are reading the card. This is the
            app's only way to delete a card, so it stays plainly visible and
            labelled — not folded back into a menu.

            A `<button>` rather than a `UButton`: this needs to be a full-bleed row
            matching `UiFieldRow`'s geometry, which means no button padding of its
            own and a hover that fills the row edge to edge.
          -->
          <button
            type="button"
            class="group w-full flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] text-sm font-medium text-muted hover:text-error hover:bg-error/5 transition-colors cursor-pointer"
            @click="showDeleteConfirm = true"
          >
            <!-- `gap-1.5` and a dimmed glyph, both copied off UiFieldRow's label
                 rather than guessed: the words land in the same column as "Status"
                 and "Created", and the icon sits one step quieter than them the way
                 every icon in this rail does. -->
            <UIcon
              name="i-lucide-trash-2"
              class="text-sm shrink-0 text-dimmed group-hover:text-error transition-colors"
            />
            Delete card
          </button>
        </div>
      </aside>

      <!-- ═══ MAIN CONTENT — title + description ═══ -->
      <!-- Also the drop region: a file may land anywhere down this column, not
           only on the attachments section. The ring says where — on the column
           rather than on that section, which a long description can push out of
           sight. -->
      <div
        ref="dropRoot"
        class="flex-1 min-w-0 order-1 rounded-xl transition-shadow"
        :class="dragging ? 'ring-2 ring-primary ring-offset-4 ring-offset-default' : ''"
      >
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

        <!-- No heading over the card's own body — see CardModal for why the other
             two sections keep theirs and this one never had a claim to one. -->

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

        <!-- Description: read mode. Copy and Edit sit where the heading's button
             did, absolutely positioned so the pair costs no height; see CardModal
             for why the pencil is the only way into the editor now, and why it is
             always drawn rather than revealed on hover. -->
        <div
          v-else-if="description"
          class="relative"
        >
          <div class="absolute top-0 right-0 flex items-center gap-0.5">
            <UTooltip :text="descriptionCopied ? 'Copied!' : 'Copy as Markdown'">
              <UButton
                :icon="descriptionCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                color="neutral"
                variant="ghost"
                size="xs"
                :class="descriptionCopied ? 'text-success!' : ''"
                aria-label="Copy the description as Markdown"
                @click="copyDescription"
              />
            </UTooltip>
            <UTooltip text="Edit description">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Edit the description"
                @click="startEditingDescription"
              />
            </UTooltip>
          </div>

          <div class="select-text pr-16">
            <ProseDescription :content="description" />
          </div>
        </div>

        <!-- Empty: one row that is the label, the empty state and the button, and
             the same row the comment composer is. -->
        <button
          v-else
          type="button"
          class="w-full flex items-center gap-2.5 rounded-lg border border-default bg-default px-3 py-2 text-left hover:bg-muted transition-colors"
          @click="startEditingDescription"
        >
          <UIcon
            name="i-lucide-text"
            class="text-base text-dimmed shrink-0"
          />
          <span class="text-sm text-dimmed">Add a description…</span>
        </button>

        <!-- Attachments -->
        <div class="mt-6">
          <AttachmentList
            ref="attachmentsRef"
            :card-id="card?.id"
            :dragging="dragging"
          />
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
