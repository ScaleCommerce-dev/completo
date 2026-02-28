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
  projectKey,
  doneStatusId,
  availableColumns,
  canConfigureColumns,
  canAddColumns,
  status: _status,
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
  updateTagFilters,
  renameBoard
} = useKanban(boardSlug, { projectSlug })
watch(boardError, (err) => {
  if (err) showError(err)
}, { immediate: true })

const { data: projectData } = await useFetch(`/api/projects/${projectSlug}`)

// Derive flat card list from cardsByColumn for the shared composable
const allCards = computed(() => {
  const cards = []
  for (const colCards of Object.values(cardsByColumn.value)) {
    cards.push(...colCards)
  }
  return cards
})

const {
  activePriorityFilters,
  activeTagFilters,
  openCards,
  togglePriorityFilter,
  showCardDetail,
  selectedCard,
  openCardDetail,
  showCreateCard,
  handleCreateCard,
  handleUpdateCard,
  handleDeleteCard
} = useViewPage({
  allCards,
  tagFilters,
  doneStatusId,
  updateCardTags,
  createCard,
  updateCard,
  deleteCard
})

interface ViewSwitcherItem {
  label: string
  icon: string
  disabled?: boolean
  onSelect: () => void
}

const viewSwitcherItems = computed(() => {
  const pd = projectData.value as { boards?: Array<{ id: string, name: string, slug: string }>, lists?: Array<{ id: string, name: string, slug: string }> } | null
  const boards = pd?.boards || []
  const lists = pd?.lists || []
  const items: ViewSwitcherItem[][] = []
  if (boards.length) {
    items.push(boards.map(b => ({
      label: b.name,
      icon: b.slug === boardSlug || b.id === boardSlug ? 'i-lucide-check' : 'i-lucide-layout-dashboard',
      disabled: b.slug === boardSlug || b.id === boardSlug,
      onSelect: () => navigateTo(`/projects/${projectSlug}/boards/${b.slug || b.id}`)
    })))
  }
  if (lists.length) {
    items.push(lists.map(l => ({
      label: l.name,
      icon: 'i-lucide-list',
      onSelect: () => navigateTo(`/projects/${projectSlug}/lists/${l.slug || l.id}`)
    })))
  }
  return items
})

const showColumnConfig = ref(false)
const createCardStatusId = ref('')

const filteredCardsByColumn = computed(() => {
  const hasPriority = activePriorityFilters.value.size > 0
  const hasTag = activeTagFilters.value.size > 0
  if (!hasPriority && !hasTag) return cardsByColumn.value
  const filtered: typeof cardsByColumn.value = {}
  for (const [colId, cards] of Object.entries(cardsByColumn.value)) {
    filtered[colId] = cards.filter((c) => {
      if (hasPriority && !activePriorityFilters.value.has(c.priority)) return false
      if (hasTag && !(c.tags || []).some(t => activeTagFilters.value.has(t.id))) return false
      return true
    })
  }
  return filtered
})

function openCreateCard(statusId: string) {
  createCardStatusId.value = statusId
  showCreateCard.value = true
}

function handleCardMoved(cardId: number, toColumnId: string, toPosition: number) {
  moveCard(cardId, toColumnId, toPosition)
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

async function handleDeleteBoard() {
  if (!board.value) return
  try {
    await $fetch(`/api/boards/${board.value.id}` as string, { method: 'DELETE' as const })
    await navigateTo(`/projects/${route.params.slug}`)
  } catch {
    // error already toasted
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <ViewHeader
      :project-name="board?.project?.name || ''"
      :project-slug="projectSlug"
      :view-name="board?.name || ''"
      view-icon="i-lucide-layout-dashboard"
      :view-switcher-items="viewSwitcherItems"
      :open-cards="openCards"
      :active-priority-filters="activePriorityFilters"
      :active-tag-filters="activeTagFilters"
      :tags="tagsData"
      :can-configure="canConfigureColumns"
      @toggle-priority="togglePriorityFilter"
      @open-settings="showColumnConfig = true"
    />

    <KanbanBoard
      :columns="columnsData"
      :cards-by-column="filteredCardsByColumn"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      :done-status-id="doneStatusId"
      :can-configure-columns="canConfigureColumns"
      :can-add-columns="canAddColumns"
      :available-columns="availableColumns"
      :members="membersData"
      @card-click="openCardDetail"
      @card-moved="handleCardMoved"
      @card-update="handleUpdateCard"
      @add-card="openCreateCard"
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
      @update="handleUpdateCard"
      @delete="handleDeleteCard"
    />

    <ViewConfigModal
      v-if="canConfigureColumns"
      v-model:open="showColumnConfig"
      mode="board"
      :columns="columnsData"
      :available-columns="availableColumns"
      :can-add-columns="canAddColumns"
      :tags="tagsData"
      :active-tag-filters="[...activeTagFilters]"
      :view-name="board?.name || ''"
      :view-type="'board'"
      @add="addColumn"
      @update="updateColumn"
      @delete="deleteColumn"
      @reorder="reorderColumns"
      @link="linkColumn"
      @update-tag-filters="(ids: string[]) => { activeTagFilters = new Set(ids); updateTagFilters(ids) }"
      @rename="handleRenameBoard"
      @delete-view="handleDeleteBoard"
    />

    <CardModal
      v-model:open="showCreateCard"
      :statuses="columnsData"
      :members="membersData"
      :tags="tagsData"
      :status-id="createCardStatusId"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      @create="handleCreateCard"
    />
  </div>
</template>
