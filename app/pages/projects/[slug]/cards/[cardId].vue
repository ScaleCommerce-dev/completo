<script setup lang="ts">
import type { Member, PersonRef, SubtaskProgress, SubtaskRow } from '~/types/card'

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
  creator: PersonRef | null
  createdAt: string
  updatedAt: string
  project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null } | null
  statuses: Array<{ id: string, name: string, color: string | null }>
  parentId: number | null
  parent: { id: number, title: string, ticket?: string } | null
  subtaskCards: SubtaskRow[]
  subtasks: SubtaskProgress | null
  members: Member[]
  projectTags: Array<{ id: string, name: string, color: string }>
  /** Viewer's role in this project; admins get a synthetic 'owner'. */
  role: string
}
const { data: cardData, error: fetchError, status, refresh: refreshCard } = useFetch<CardDetail>(`/api/cards/${cardId}`)
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

/** The Parent field — see `CardProperties` — once the card has loaded. */
const parentField = computed(() => {
  const c = cardData.value
  if (!c?.project) return undefined
  return {
    cardId: c.id,
    projectId: c.project.id,
    projectKey: c.project.key,
    parent: c.parent,
    locked: c.subtaskCards.length > 0
  }
})

/** Re-read after a parent change, for the parent's ticket and the sub-task list. */
async function setParent(parentId: number | null) {
  await persist({ parentId })
  await refreshCard()
}

function openSubtask(id: number) {
  navigateTo(`/projects/${projectSlug}/cards/${formatTicketId(projectKey.value, id)}`)
}
// Owners (and admins, who resolve to a synthetic 'owner') may delete others' comments
const canModerateComments = computed(() => cardData.value?.role === 'owner')

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

/**
 * Properties save as they change, matching the board, the list and the card
 * modal. Save is left holding the description, which is the only field here that
 * is genuinely a draft.
 *
 * `cardData` is patched locally from each response so the composable's own
 * divergence checks stay accurate without a refetch — and so a rejected save
 * snaps the control back to what the server actually holds.
 */
const beginWrite = createWriteSequence<number>()

/** Whether the save went through; `useCardEditor` keeps the draft when it did not. */
async function persist(updates: Record<string, unknown>): Promise<boolean> {
  if (!card.value) return false
  const id = card.value.id
  const isLatest = beginWrite(id)
  try {
    const updated = await $fetch<Partial<CardDetail>>(`/api/cards/${id}`, { method: 'PUT', body: updates })
    // Only the newest write may merge. This page is the one that showed the
    // symptom: an out-of-order response repainted `cardData`, the sync watcher
    // saw local and card disagree, and `syncProperties` pulled the control back
    // to the value the *previous* edit set.
    if (updated && isLatest()) cardData.value = { ...cardData.value, ...updated } as CardDetail
    return true
  } catch (e: unknown) {
    useToast().add({ title: 'Failed to save', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
    // Re-assign so the sync watcher fires and pulls the controls back.
    cardData.value = { ...cardData.value } as CardDetail
    syncProperties()
    return false
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

const showDeleteConfirm = ref(false)
const showDuplicate = ref(false)
const deletingCard = ref(false)

/** Whether the fields hold the card yet; until then nothing saves. */
const synced = ref(false)

/** The editing state and handlers, shared with the card panel. */
const {
  UNASSIGNED,
  title,
  description,
  priority,
  selectedStatusId,
  selectedAssigneeId,
  selectedTagIds,
  selectedDueDate,
  selectedTagNames,
  editingDescription,
  savingDescription,
  titleInput,
  descriptionEditorRef,
  resizeTitle,
  descriptionDraft,
  descriptionDirty,
  populate,
  flushTitle,
  syncProperties,
  startEditingDescription,
  cancelEditingDescription,
  saveDescription,
  descriptionCopied,
  copyDescription
} = useCardEditor({
  card: () => card.value,
  tags: () => projectTagsData.value,
  enabled: () => synced.value && !!card.value,
  save: persist,
  saveTags: persistTags
})

/**
 * Populated once, on load. Each save replaces `cardData` with the response, so
 * populating on every change would overwrite a title being typed; a different
 * card repopulates through `useCardEditor` instead.
 */
watch(card, (c) => {
  if (c && !synced.value) {
    populate(c)
    synced.value = true
  }
}, { immediate: true })

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
 * ⌘↵ commits the editor you are in (see `useCmdEnter`). A comment editor claims
 * it first; otherwise it belongs to the description, the only thing on this page
 * that is still explicitly saved.
 */
useCmdEnter(saveDescription, { active: () => editingDescription.value })

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
  <UiPage
    width="wide"
    :title="card ? formatTicketId(projectKey, card.id) : undefined"
    :crumbs="[{ label: 'All Projects', to: '/projects' }, { label: cardData?.project?.name || '', to: `/projects/${projectSlug}` }]"
  >
    <!--
      A detail page (handoff `03` › Seitentypen › Detail): the record's own title
      is the page heading, and its ticket ID is the metadata above it — the copy
      control, so the number you read is the one you can click. It was the other
      way round once ("TK-1" as the 26px heading over the real title at 16px),
      and later beside the title at body size, where it still competed with it.
      On its own line at 14px it reads as a label of the title, and the title
      starts at the page's left edge like every other page title.
    -->
    <template #eyebrow>
      <TicketIdCopy
        v-if="card"
        :project-key="projectKey"
        :project-slug="projectSlug"
        :card-id="card.id"
        :copy-buttons="false"
        class="self-start text-sm"
      />
    </template>
    <template #title>
      <!-- A textarea, so a long title wraps rather than running off the edge.
           See `resizeTitle` in useCardEditor; Enter still commits. It takes the page title's size
           and tracking from the `h1` it sits in. -->
      <textarea
        v-if="card"
        ref="titleInput"
        v-model="title"
        rows="1"
        aria-label="Card title"
        placeholder="Card title..."
        class="title-field block w-full lg:max-w-[calc(100%-var(--spacing-column)-1.5rem)] text-highlighted placeholder:text-dimmed bg-transparent border-0 rounded-none p-0 resize-none overflow-hidden"
        @input="resizeTitle"
        @blur="flushTitle"
        @keydown.enter.prevent="flushTitle"
      />
    </template>

    <!-- Under the title, in the slot UiPage keeps for what belongs to it. -->
    <template
      v-if="parentField?.parent"
      #description
    >
      <CardParentLink
        :field="{ ...parentField, parent: parentField.parent }"
        :project-slug="projectSlug"
        class="lg:max-w-[calc(100%-var(--spacing-column)-1.5rem)]"
        @set-parent="setParent"
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
      <USkeleton class="hidden lg:block h-48 w-column shrink-0" />
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
      <aside class="w-full lg:w-column shrink-0 order-2 lg:sticky lg:top-4">
        <div class="rounded-xl border border-default bg-default shadow-raise overflow-hidden divide-y divide-default">
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
            :done-status-id="card?.project?.doneStatusId"
            :open-subtasks="card ? openSubtaskCount(card) : 0"
            :parent-field="parentField"
            @set-parent="setParent"
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

          <!-- Same row geometry as Delete below, without the red: duplicating
               creates, it destroys nothing. Opens CardDuplicateDialog. -->
          <button
            type="button"
            class="group w-full flex items-center gap-1.5 px-4 py-2.5 min-h-row text-sm font-medium text-muted hover:text-highlighted hover:bg-elevated transition-colors cursor-pointer"
            @click="showDuplicate = true"
          >
            <UIcon
              name="i-lucide-copy-plus"
              class="text-sm shrink-0 text-dimmed group-hover:text-toned transition-colors"
            />
            Duplicate card
          </button>

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
            class="group w-full flex items-center gap-1.5 px-4 py-2.5 min-h-row text-sm font-medium text-muted hover:text-error hover:bg-error/5 transition-colors"
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
        class="flex-1 min-w-0 order-1 rounded-xl border border-default bg-default shadow-raise p-6 transition-shadow"
        :class="dragging ? 'ring-2 ring-primary ring-offset-4 ring-offset-default' : ''"
      >
        <!-- No heading over the card's own body — see CardModal for why the other
             two sections keep theirs and this one never had a claim to one. -->

        <!-- Description: edit mode -->
        <CardDescriptionSection
          ref="descriptionEditorRef"
          v-model="description"
          :editing="editingDescription"
          :restored="!!descriptionDraft.restored.value"
          :dirty="descriptionDirty"
          :saving="savingDescription"
          :copied="descriptionCopied"
          :min-height="240"
          :title="title"
          :tags="selectedTagNames"
          :priority="priority"
          :project-slug="projectSlug"
          :project-key="projectKey"
          :members="membersData"
          :card-id="card?.id"
          @save="saveDescription"
          @cancel="cancelEditingDescription"
          @edit="startEditingDescription"
          @copy="copyDescription"
        />

        <!-- Sub-tasks: one level, so a sub-task has none of its own. -->
        <div
          v-if="card?.project && !card.parentId"
          class="mt-6"
        >
          <CardSubtasks
            :card-id="card.id"
            :project-id="card.project.id"
            :subtasks="card.subtaskCards"
            :statuses="statusesData"
            :done-status-id="card.project.doneStatusId"
            :progress="card.subtasks"
            @created="refreshCard"
            @open="openSubtask"
          />
        </div>

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
      :description="card?.subtaskCards.length
        ? `Its comments and attachments go with it. Its ${card.subtaskCards.length} sub-task${card.subtaskCards.length === 1 ? '' : 's'} stay, as ordinary cards. This cannot be undone.`
        : 'Its comments and attachments go with it. This cannot be undone.'"
      action-label="Delete card"
      :loading="deletingCard"
      @confirm="confirmDelete"
    />

    <CardDuplicateDialog
      v-if="card"
      v-model:open="showDuplicate"
      :card-id="card.id"
      :card-title="card.title"
      :project-slug="projectSlug"
      :subtask-count="card.subtaskCards.length"
      @duplicated="(copy) => navigateTo(`/projects/${copy.projectSlug}/cards/${formatTicketId(copy.projectKey, copy.id)}`)"
    />
  </UiPage>
</template>
