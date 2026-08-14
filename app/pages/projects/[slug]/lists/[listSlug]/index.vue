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
  canModerateComments,
  canSaveSort,
  status,
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
  <ViewHeader
    :project-name="list?.project?.name || ''"
    :project-slug="projectSlug"
    :view-name="list?.name || ''"
    view-kind="list"
    :view-slug="listSlug"
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
        @click="openCreateCard"
      />
    </template>

    <ListSkeleton
      v-if="status === 'pending' && !columnsData.length"
      :columns="Math.max(columnsData.length, 6)"
    />

    <ListView
      v-else
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
      :can-moderate="canModerateComments"
      @update="handleUpdateCard"
      @update-tags="updateCardTags"
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
  </ViewHeader>
</template>
