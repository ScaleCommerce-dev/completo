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
  updateTagFilters,
  renameBoard
} = useKanban(boardSlug, { projectSlug })
watch(boardError, (err) => {
  if (err) showError(err)
}, { immediate: true })

const { data: projectData } = await useFetch(`/api/projects/${projectSlug}`)

const viewSwitcherItems = computed(() => {
  const boards = (projectData.value as any)?.boards || []
  const lists = (projectData.value as any)?.lists || []
  const items: any[][] = []
  if (boards.length) {
    items.push(boards.map((b: any) => ({
      label: b.name,
      icon: b.slug === boardSlug || b.id === boardSlug ? 'i-lucide-check' : 'i-lucide-layout-dashboard',
      disabled: b.slug === boardSlug || b.id === boardSlug,
      onSelect: () => navigateTo(`/projects/${projectSlug}/boards/${b.slug || b.id}`)
    })))
  }
  if (lists.length) {
    items.push(lists.map((l: any) => ({
      label: l.name,
      icon: 'i-lucide-list',
      onSelect: () => navigateTo(`/projects/${projectSlug}/lists/${l.slug || l.id}`)
    })))
  }
  return items
})

const showCardDetail = ref(false)
const selectedCard = ref<any>(null)
const showColumnConfig = ref(false)
const showCreateCard = ref(false)
const createCardStatusId = ref('')

// Priority filter (multi-select)
const activePriorityFilters = ref<Set<string>>(new Set())

// Tag filter (persisted, managed via settings modal)
const activeTagFilters = ref<Set<string>>(new Set())

watch(tagFilters, (tf) => {
  activeTagFilters.value = new Set(tf || [])
}, { immediate: true })

const filteredCardsByColumn = computed(() => {
  const hasPriority = activePriorityFilters.value.size > 0
  const hasTag = activeTagFilters.value.size > 0
  if (!hasPriority && !hasTag) return cardsByColumn.value
  const filtered: Record<string, any[]> = {}
  for (const [colId, cards] of Object.entries(cardsByColumn.value)) {
    filtered[colId] = cards.filter((c: any) => {
      if (hasPriority && !activePriorityFilters.value.has(c.priority)) return false
      if (hasTag && !(c.tags || []).some((t: any) => activeTagFilters.value.has(t.id))) return false
      return true
    })
  }
  return filtered
})

const openCards = computed(() => {
  let count = 0
  for (const [colId, cards] of Object.entries(cardsByColumn.value)) {
    if (colId !== doneStatusId.value) count += cards.length
  }
  return count
})

const priorityCounts = computed(() => {
  const counts: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 }
  for (const [colId, cards] of Object.entries(cardsByColumn.value)) {
    if (colId === doneStatusId.value) continue
    for (const card of cards) {
      if (card.priority in counts) counts[card.priority]!++
    }
  }
  return counts
})

function togglePriorityFilter(priority: string) {
  const next = new Set(activePriorityFilters.value)
  if (next.has(priority)) {
    next.delete(priority)
  } else {
    next.add(priority)
  }
  activePriorityFilters.value = next
}

function openCardDetail(card: any) {
  selectedCard.value = card
  showCardDetail.value = true
}

function openCreateCard(statusId: string) {
  createCardStatusId.value = statusId
  showCreateCard.value = true
}

async function handleCreateCard(data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }) {
  const newCard = await createCard(data.statusId, data.title, {
    description: data.description || undefined,
    priority: data.priority,
    assigneeId: data.assigneeId || undefined,
    dueDate: data.dueDate || undefined
  })
  if (data.tagIds?.length && newCard) {
    await updateCardTags((newCard as any).id, data.tagIds)
  }
  showCreateCard.value = false
}

async function handleUpdateCard(cardId: number, updates: any, tagIds?: string[]) {
  await updateCard(cardId, updates)
  if (tagIds !== undefined) {
    await updateCardTags(cardId, tagIds)
  }
  if (selectedCard.value?.id === cardId) {
    const updatedCards = board.value?.cards || []
    selectedCard.value = updatedCards.find((c: any) => c.id === cardId) || null
  }
}

async function handleDeleteCard(cardId: number) {
  await deleteCard(cardId)
  showCardDetail.value = false
  selectedCard.value = null
}

function handleCardMoved(cardId: number, toColumnId: string, toPosition: number) {
  moveCard(cardId, toColumnId, toPosition)
}

// Settings modal handlers
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
    await $fetch(`/api/boards/${board.value.id}`, { method: 'DELETE' as any })
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
            <UIcon name="i-lucide-folder" class="size-4 shrink-0" />
            <span class="truncate max-w-40">{{ board?.project?.name || '' }}</span>
          </NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3.5 text-zinc-300 dark:text-zinc-600 shrink-0" />
          <UDropdownMenu :items="viewSwitcherItems">
            <button
              type="button"
              class="group/name flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <UIcon name="i-lucide-layout-dashboard" class="size-4 shrink-0 text-zinc-400" />
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
            <UIcon name="i-lucide-layers" class="size-3.5" />
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
            <UIcon :name="priorityIcon(p)" class="text-[15px]" />
            {{ p }}
          </button>
        </div>

        <!-- Active tag filters (read-only) -->
        <div v-if="activeTagFilters.size" class="flex items-center gap-1 mr-1">
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
          <UIcon name="i-lucide-settings" class="text-sm" />
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
      :card="selectedCard"
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
