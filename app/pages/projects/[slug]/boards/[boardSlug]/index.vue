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
  updateFilters,
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
  activeTagFilters,
  openCards,
  showCardDetail,
  selectedCard,
  openCardDetail,
  showCreateCard,
  ensureCardForDraft,
  handleCreateCard,
  handleUpdateCard,
  handleDeleteCard,
  deleteDraftCard
} = useViewPage({
  allCards,
  tagFilters,
  statusFilters,
  assigneeFilters,
  priorityFilters,
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

const activeFilterCount = computed(() => {
  let count = 0
  if (statusFilters.value.length) count += statusFilters.value.length
  if (priorityFilters.value.length) count += priorityFilters.value.length
  if (assigneeFilters.value.length) count += assigneeFilters.value.length
  if (activeTagFilters.value.size) count += activeTagFilters.value.size
  return count
})

const filterSummary = computed(() => {
  const lines: string[] = []
  if (statusFilters.value.length) {
    const names = statusFilters.value.map(id => columnsData.value.find(s => s.id === id)?.name).filter(Boolean)
    if (names.length) lines.push(`Status: ${names.join(', ')}`)
  }
  if (priorityFilters.value.length) {
    lines.push(`Priority: ${priorityFilters.value.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}`)
  }
  if (assigneeFilters.value.length) {
    const names = assigneeFilters.value.map(id => membersData.value.find(m => m.id === id)?.name).filter(Boolean)
    if (names.length) lines.push(`Assignee: ${names.join(', ')}`)
  }
  if (activeTagFilters.value.size) {
    const names = [...activeTagFilters.value].map(id => tagsData.value.find(t => t.id === id)?.name).filter(Boolean)
    if (names.length) lines.push(`Tags: ${names.join(', ')}`)
  }
  return lines.join('\n')
})

const filteredCardsByColumn = computed(() => {
  const hasStatus = statusFilters.value.length > 0
  const hasPriority = priorityFilters.value.length > 0
  const hasAssignee = assigneeFilters.value.length > 0
  const hasTag = activeTagFilters.value.size > 0
  if (!hasStatus && !hasPriority && !hasAssignee && !hasTag) return cardsByColumn.value
  const statusSet = hasStatus ? new Set(statusFilters.value) : null
  const prioritySet = hasPriority ? new Set(priorityFilters.value) : null
  const assigneeSet = hasAssignee ? new Set(assigneeFilters.value) : null
  const filtered: typeof cardsByColumn.value = {}
  for (const [colId, cards] of Object.entries(cardsByColumn.value)) {
    filtered[colId] = cards.filter((c) => {
      if (statusSet && !statusSet.has(c.statusId)) return false
      if (prioritySet && !prioritySet.has(c.priority)) return false
      if (assigneeSet && !(c.assigneeId && assigneeSet.has(c.assigneeId))) return false
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
      :active-filter-count="activeFilterCount"
      :filter-summary="filterSummary"
      :can-configure="canConfigureColumns"
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
      :statuses="columnsData"
      :members="membersData"
      :active-tag-filters="[...activeTagFilters]"
      :active-status-filters="[...statusFilters]"
      :active-assignee-filters="[...assigneeFilters]"
      :active-priority-filters="[...priorityFilters]"
      :view-name="board?.name || ''"
      :view-type="'board'"
      @add="addColumn"
      @update="updateColumn"
      @delete="deleteColumn"
      @reorder="reorderColumns"
      @link="linkColumn"
      @update-filters="(filters) => { if (filters.tagFilters) activeTagFilters = new Set(filters.tagFilters); updateFilters(filters) }"
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
      :on-ensure-card="ensureCardForDraft"
      @create="handleCreateCard"
      @update="handleUpdateCard"
      @delete-draft="deleteDraftCard"
    />
  </div>
</template>
