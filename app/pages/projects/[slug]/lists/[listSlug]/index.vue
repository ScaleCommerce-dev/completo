<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const listSlug = route.params.listSlug as string
const projectSlug = route.params.slug as string

const {
  list,
  error: listError,
  columnsData,
  allCards,
  statusesData,
  membersData,
  tagsData,
  tagFilters,
  statusFilters,
  assigneeFilters,
  priorityFilters,
  projectKey,
  doneStatusId,
  sortField,
  sortDirection,
  canConfigureColumns,
  canSaveSort,
  status: _status,
  refresh,
  createCard,
  updateCard,
  deleteCard,
  updateCardTags,
  updateFilters,
  addColumn,
  removeColumn,
  reorderColumns,
  saveSort,
  renameList
} = useListView(listSlug, { projectSlug })
watch(listError, (err) => {
  if (err) showError(err)
}, { immediate: true })

const { data: projectData } = await useFetch(`/api/projects/${projectSlug}`)

const {
  activeTagFilters,
  isFiltered,
  filteredCards,
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
  handleDeleteCard,
  deleteDraftCard
} = useViewPage({
  allCards,
  tagFilters,
  statusFilters,
  assigneeFilters,
  priorityFilters,
  statuses: statusesData,
  members: membersData,
  tags: tagsData,
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
      icon: 'i-lucide-layout-dashboard',
      onSelect: () => navigateTo(`/projects/${projectSlug}/boards/${b.slug || b.id}`)
    })))
  }
  if (lists.length) {
    items.push(lists.map(l => ({
      label: l.name,
      icon: l.slug === listSlug || l.id === listSlug ? 'i-lucide-check' : 'i-lucide-list',
      disabled: l.slug === listSlug || l.id === listSlug,
      onSelect: () => navigateTo(`/projects/${projectSlug}/lists/${l.slug || l.id}`)
    })))
  }
  return items
})

const showColumnConfig = ref(false)

function openCreateCard() {
  showCreateCard.value = true
}

async function handleInlineUpdate(cardId: number, updates: Record<string, unknown>) {
  await updateCard(cardId, updates)
}

async function handleInlineTagUpdate(cardId: number, tagIds: string[]) {
  await updateCardTags(cardId, tagIds)
}

async function handleSort(field: string | null, direction: 'asc' | 'desc' | null) {
  if (canSaveSort.value) {
    await saveSort(field, direction)
  }
}

async function handleRenameList(name: string) {
  try {
    const newSlug = await renameList(name)
    if (newSlug && newSlug !== listSlug) {
      await navigateTo(`/projects/${projectSlug}/lists/${newSlug}`, { replace: true })
    } else {
      await refresh()
    }
  } catch {
    // error already toasted
  }
}

async function handleDeleteList() {
  if (!list.value) return
  try {
    await $fetch(`/api/lists/${list.value.id}` as string, { method: 'DELETE' as const })
    await navigateTo(`/projects/${route.params.slug}`)
  } catch {
    // error already toasted
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <ViewHeader
      :project-name="list?.project?.name || ''"
      :project-slug="projectSlug"
      :view-name="list?.name || ''"
      view-icon="i-lucide-list"
      :view-switcher-items="viewSwitcherItems"
      :card-count="visibleCardCount"
      :active-filter-count="activeFilterCount"
      :filter-summary="filterSummary"
      :can-configure="canConfigureColumns"
      @open-settings="showColumnConfig = true"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          label="New Card"
          variant="subtle"
          color="primary"
          size="xs"
          @click="openCreateCard"
        />
      </template>
    </ViewHeader>

    <ListView
      :columns="columnsData"
      :cards="filteredCards"
      :statuses="statusesData"
      :tags="tagsData"
      :members="membersData"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      :done-status-id="doneStatusId"
      :can-configure-columns="canConfigureColumns"
      :is-filtered="isFiltered"
      :sort-field="sortField"
      :sort-direction="sortDirection"
      :can-save-sort="canSaveSort"
      @card-click="openCardDetail"
      @add-card="openCreateCard"
      @update="handleInlineUpdate"
      @update-tags="handleInlineTagUpdate"
      @sort="handleSort"
    />

    <CardModal
      v-model:open="showCardDetail"
      :card="selectedCard ?? undefined"
      :statuses="statusesData"
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
      mode="list"
      :columns="columnsData"
      :tags="tagsData"
      :statuses="statusesData"
      :members="membersData"
      :active-tag-filters="[...activeTagFilters]"
      :active-status-filters="[...statusFilters]"
      :active-assignee-filters="[...assigneeFilters]"
      :active-priority-filters="[...priorityFilters]"
      :view-name="list?.name || ''"
      :view-type="'list'"
      @add="addColumn"
      @delete="removeColumn"
      @reorder="reorderColumns"
      @update-filters="(filters) => { if (filters.tagFilters) activeTagFilters = new Set(filters.tagFilters); updateFilters(filters) }"
      @rename="handleRenameList"
      @delete-view="handleDeleteList"
    />

    <CardModal
      v-model:open="showCreateCard"
      :statuses="statusesData"
      :members="membersData"
      :tags="tagsData"
      :project-key="projectKey"
      :project-slug="(route.params.slug as string)"
      :on-ensure-card="ensureCardForDraft"
      @create="handleCreateCard"
      @update="handleUpdateCard"
      @delete-draft="deleteDraftCard"
    />
  </div>
</template>
