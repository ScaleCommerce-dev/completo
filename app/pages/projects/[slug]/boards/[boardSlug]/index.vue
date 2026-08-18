<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const boardSlug = route.params.boardSlug as string
const projectSlug = route.params.slug as string

const {
  board,
  error: boardError,
  columnsData,
  cardsByColumn,
  membersData,
  tagsData,
  tagFilters,
  statusFilters,
  assigneeFilters,
  priorityFilters,
  projectKey,
  doneStatusId,
  hiddenCardFields,
  availableColumns,
  canConfigureColumns,
  canModerateComments,
  canAddColumns,
  status,
  refresh,
  moveCard,
  createCard,
  updateCard,
  deleteCard,
  addColumn,
  updateColumn,
  deleteColumn,
  linkColumn,
  reorderColumns,
  updateCardTags,
  updateFilters,
  updateDisplay,
  renameBoard
} = useKanban(boardSlug, { projectSlug })
watch(boardError, (err) => {
  if (err) showError(err)
}, { immediate: true })

interface View {
  id: string
  name: string
  slug: string
}

const { data: projectData } = await useFetch(`/api/projects/${projectSlug}`)

/** The project's other views, for the switcher in `ViewHeader`. */
const projectViews = computed(() => {
  const project = projectData.value as { boards?: View[], lists?: View[] } | null
  return { boards: project?.boards || [], lists: project?.lists || [] }
})

// Derive flat card list from cardsByColumn for the shared composable
const allCards = computed(() => {
  const cards = []
  for (const colCards of Object.values(cardsByColumn.value)) {
    cards.push(...colCards)
  }
  return cards
})

const {
  activeTagFilters,
  applyFilters,
  filterState,
  visibleCardCount,
  activeFilterCount,
  filterSummary,
  showCardDetail,
  selectedCard,
  openCardDetail,
  showCreateCard,
  ensureCardForDraft,
  handleCreateCard,
  handleUpdateCard,
  deleteDraftCard
} = useViewPage({
  allCards,
  tagFilters,
  statusFilters,
  assigneeFilters,
  priorityFilters,
  statuses: columnsData,
  members: membersData,
  tags: tagsData,
  updateCardTags,
  createCard,
  updateCard,
  deleteCard
})

const showColumnConfig = ref(false)
const createCardStatusId = ref('')

const filteredCardsByColumn = computed(() => {
  const filtered: typeof cardsByColumn.value = {}
  for (const [colId, cards] of Object.entries(cardsByColumn.value)) {
    filtered[colId] = applyFilters(cards)
  }
  return filtered
})

/**
 * Walk the board from inside the card panel: ↑/↓ through the column you are in,
 * ←/→ to the top of the next one.
 *
 * The panel makes the board inert, so the arrows have nothing else to do while
 * it is open — except inside an editor, a menu or the date calendar, each of
 * which has a stronger claim on them. `arrowKeysAreClaimed` is that check, and
 * it works by role and focus rather than by listener order.
 *
 * Driven from here rather than from KanbanBoard because the ordering that
 * matters is the *filtered* one — arrowing onto a card the current filters hide
 * would look like the panel had opened the wrong card.
 */
const boardRef = ref<{ revealColumn: (columnId: string) => void } | null>(null)

function navigateCards(direction: NavDirection) {
  const current = selectedCard.value
  if (!current) return

  const target = nextCard({
    columns: columnsData.value,
    cardsByColumn: filteredCardsByColumn.value,
    currentColumnId: current.statusId,
    currentCardId: current.id,
    direction
  })
  if (!target) return

  if (target.columnId !== current.statusId) boardRef.value?.revealColumn(target.columnId)
  openCardDetail({ id: target.cardId })
}

/**
 * What the panel's chevrons are allowed to do. Computed rather than assumed, so
 * a card at the top or bottom of its column disables the control that would go
 * nowhere instead of offering a click that does nothing.
 */
const cardNav = computed(() => {
  const current = selectedCard.value
  if (!current) return undefined
  const probe = (direction: NavDirection) => !!nextCard({
    columns: columnsData.value,
    cardsByColumn: filteredCardsByColumn.value,
    currentColumnId: current.statusId,
    currentCardId: current.id,
    direction
  })
  return {
    hasPrev: probe('up'),
    hasNext: probe('down'),
    hasPrevColumn: probe('left'),
    hasNextColumn: probe('right'),
    position: columnPosition(filteredCardsByColumn.value, current.statusId, current.id)
  }
})

const NAV_DIRECTIONS: Record<string, NavDirection> = {
  prev: 'up',
  next: 'down',
  prevColumn: 'left',
  nextColumn: 'right'
}

const ARROWS: Record<string, NavDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
}

function onArrowKey(e: KeyboardEvent) {
  if (!showCardDetail.value || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
  const direction = ARROWS[e.key]
  if (!direction || arrowKeysAreClaimed(document)) return
  e.preventDefault()
  navigateCards(direction)
}

onMounted(() => document.addEventListener('keydown', onArrowKey, true))
onUnmounted(() => document.removeEventListener('keydown', onArrowKey, true))

/**
 * `statusId` is omitted when the board-level "New card" button is used rather
 * than a column's own — the board had no header-level add button at all before,
 * only the list view did. Falling back to the leftmost column matches where a
 * card would naturally start.
 */
function openCreateCard(statusId?: string) {
  createCardStatusId.value = statusId ?? columnsData.value[0]?.id ?? ''
  showCreateCard.value = true
}

/**
 * Translated here rather than in `KanbanBoard`, for the same reason the arrow
 * keys are: this is the only place that holds both orderings. The board renders
 * the filtered cards, so the index vuedraggable reports counts visible rows,
 * while the optimistic renumber and the server both splice into the stored
 * column. See `dropPosition`.
 */
function handleCardMoved(cardId: number, toColumnId: string, visibleIndex: number) {
  moveCard(cardId, toColumnId, dropPosition({
    visible: filteredCardsByColumn.value[toColumnId] || [],
    all: cardsByColumn.value[toColumnId] || [],
    cardId,
    visibleIndex
  }))
}

async function handleRenameBoard(name: string) {
  try {
    const newSlug = await renameBoard(name)
    if (newSlug && newSlug !== boardSlug) {
      await navigateTo(`/projects/${projectSlug}/boards/${newSlug}`, { replace: true })
    } else {
      await refresh()
    }
  } catch {
    // error already toasted
  }
}

// Owned here rather than in ViewConfigModal: the request is ours, so the
// pending state has to be ours too, or a failure leaves its spinner running.
const deletingBoard = ref(false)

async function handleDeleteBoard() {
  if (!board.value) return
  deletingBoard.value = true
  try {
    await $fetch(`/api/boards/${board.value.id}` as string, { method: 'DELETE' as const })
    await navigateTo(`/projects/${route.params.slug}`)
  } catch (e) {
    // Nothing else toasts this — it is a bare `$fetch`, not one of `useViewData`'s
    // wrapped mutations, and the comment that used to sit here said otherwise.
    useToast().add({ title: 'Failed to delete board', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    deletingBoard.value = false
  }
}
</script>

<template>
  <ViewHeader
    :project-name="board?.project?.name || ''"
    :project-slug="projectSlug"
    :view-name="board?.name || ''"
    view-kind="board"
    :view-slug="boardSlug"
    :boards="projectViews.boards"
    :lists="projectViews.lists"
    :card-count="visibleCardCount"
    :active-filter-count="activeFilterCount"
    :filter-summary="filterSummary"
    :can-configure="canConfigureColumns"
    @open-settings="showColumnConfig = true"
  >
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        label="New card"
        @click="openCreateCard()"
      />
    </template>

    <!-- `status` used to be destructured as `_status` and discarded, so the board
         rendered an empty shell until the request landed. -->
    <KanbanSkeleton v-if="status === 'pending' && !columnsData.length" />

    <KanbanBoard
      v-else
      ref="boardRef"
      :columns="columnsData"
      :cards-by-column="filteredCardsByColumn"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      :done-status-id="doneStatusId"
      :hidden-card-fields="hiddenCardFields"
      :can-configure-columns="canConfigureColumns"
      :can-add-columns="canAddColumns"
      :available-columns="availableColumns"
      :members="membersData"
      :tags="tagsData"
      :card-panel-open="showCardDetail"
      @card-click="openCardDetail"
      @card-moved="handleCardMoved"
      @card-update="handleUpdateCard"
      @card-update-tags="updateCardTags"
      @add-card="openCreateCard"
      @quick-add="(columnId: string, title: string) => createCard(columnId, title)"
      @add-column="(name: string, color?: string) => addColumn(name, color)"
      @link-column="linkColumn"
    />

    <CardModal
      v-model:open="showCardDetail"
      :card="selectedCard ?? undefined"
      :statuses="columnsData"
      :members="membersData"
      :tags="tagsData"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      :can-moderate="canModerateComments"
      :nav="cardNav"
      @update="handleUpdateCard"
      @update-tags="updateCardTags"
      @navigate="(d) => navigateCards(NAV_DIRECTIONS[d]!)"
    />

    <ViewConfigModal
      v-if="canConfigureColumns"
      v-model:open="showColumnConfig"
      kind="board"
      :columns="columnsData"
      :available-columns="availableColumns"
      :can-add-columns="canAddColumns"
      :tags="tagsData"
      :statuses="columnsData"
      :members="membersData"
      :active-tag-filters="[...activeTagFilters]"
      :active-status-filters="[...statusFilters]"
      :active-assignee-filters="[...assigneeFilters]"
      :active-priority-filters="[...priorityFilters]"
      :hidden-card-fields="hiddenCardFields"
      :view-name="board?.name || ''"
      :deleting-view="deletingBoard"
      @add="addColumn"
      @update="updateColumn"
      @delete="deleteColumn"
      @reorder="reorderColumns"
      @link="linkColumn"
      @update-filters="(filters) => { if (filters.tagFilters) activeTagFilters = new Set(filters.tagFilters); updateFilters(filters) }"
      @update-display="updateDisplay"
      @rename="handleRenameBoard"
      @delete-view="handleDeleteBoard"
    />

    <CardModal
      v-model:open="showCreateCard"
      :view-filters="filterState"
      view-kind="board"
      :statuses="columnsData"
      :members="membersData"
      :tags="tagsData"
      :status-id="createCardStatusId"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      :on-ensure-card="ensureCardForDraft"
      @create="handleCreateCard"
      @update="handleUpdateCard"
      @delete-draft="deleteDraftCard"
    />
  </ViewHeader>
</template>
