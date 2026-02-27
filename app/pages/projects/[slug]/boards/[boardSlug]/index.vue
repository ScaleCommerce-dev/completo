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
    <!-- Board header -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
      <div class="flex items-center gap-4">
        <nav class="flex items-center gap-1.5 text-sm">
          <NuxtLink
            :to="`/projects/${route.params.slug}`"
            class="flex items-center gap-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <UIcon
              name="i-lucide-folder"
              class="size-4 shrink-0"
            />
            <span class="truncate max-w-40">{{ board?.project?.name || '' }}</span>
          </NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 text-zinc-300 dark:text-zinc-600 shrink-0"
          />
          <UDropdownMenu :items="viewSwitcherItems">
            <button
              type="button"
              class="group/name flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <UIcon
                name="i-lucide-layout-dashboard"
                class="size-4 shrink-0 text-zinc-400"
              />
              <span class="truncate max-w-60">{{ board?.name || '' }}</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-3 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-opacity"
              />
            </button>
          </UDropdownMenu>
        </nav>
        <UTooltip text="Open cards">
          <span class="inline-flex items-center gap-1 text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
            <UIcon
              name="i-lucide-layers"
              class="size-3.5"
            />
            {{ openCards }}
          </span>
        </UTooltip>
      </div>

      <div class="flex items-center gap-2">
        <!-- Priority quick-filters -->
        <div class="flex items-center gap-1 mr-2">
          <button
            v-for="p in ['urgent', 'high', 'medium', 'low']"
            :key="p"
            class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium capitalize transition-all"
            :class="activePriorityFilters.has(p)
              ? ''
              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
            :style="activePriorityFilters.has(p) ? { color: PRIORITY_COLOR_MAP[p] } : {}"
            @click="togglePriorityFilter(p)"
          >
            <UIcon
              :name="priorityIcon(p)"
              class="text-[15px]"
            />
            {{ p }}
          </button>
        </div>

        <!-- Active tag filters (read-only) -->
        <div
          v-if="activeTagFilters.size"
          class="flex items-center gap-1 mr-1"
        >
          <span
            v-for="tag in tagsData.filter(t => activeTagFilters.has(t.id))"
            :key="tag.id"
            class="tag-pill inline-flex items-center px-1.5 py-[3px] rounded-full text-[10.5px] font-bold leading-none tracking-wide uppercase"
            :style="{
              color: tag.color,
              backgroundColor: tag.color + '25',
              boxShadow: `inset 0 0 0 1px ${tag.color}40`
            }"
          >{{ tag.name }}</span>
        </div>

        <NotificationBell />
        <button
          v-if="canConfigureColumns"
          class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all"
          @click="showColumnConfig = true"
        >
          <UIcon
            name="i-lucide-settings"
            class="text-sm"
          />
          Settings
        </button>
      </div>
    </div>

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

    <ColumnConfigModal
      v-if="canConfigureColumns"
      v-model:open="showColumnConfig"
      :columns="columnsData"
      :board-id="board?.id || boardSlug"
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
