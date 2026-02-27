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
  updateTagFilters,
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
  activePriorityFilters,
  activeTagFilters,
  isFiltered,
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

const filteredCards = computed(() => {
  const cards = allCards.value
  const hasPriority = activePriorityFilters.value.size > 0
  const hasTag = activeTagFilters.value.size > 0
  if (!hasPriority && !hasTag) return cards
  return cards.filter((c) => {
    if (hasPriority && !activePriorityFilters.value.has(c.priority)) return false
    if (hasTag && !(c.tags || []).some(t => activeTagFilters.value.has(t.id))) return false
    return true
  })
})

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
    <!-- List header -->
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <nav class="flex items-center gap-1.5 text-sm">
          <NuxtLink
            :to="`/projects/${route.params.slug}`"
            class="flex items-center gap-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <UIcon
              name="i-lucide-folder"
              class="size-4 shrink-0"
            />
            <span class="truncate max-w-40">{{ list?.project?.name || '' }}</span>
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
                name="i-lucide-list"
                class="size-4 shrink-0 text-zinc-400"
              />
              <span class="truncate max-w-60">{{ list?.name || '' }}</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-3 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-opacity"
              />
            </button>
          </UDropdownMenu>
        </nav>
        <UTooltip text="Open cards">
          <span
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono tabular-nums"
            :class="openCards > 0
              ? 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
              : 'text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50'"
          >
            <UIcon
              name="i-lucide-layers"
              class="size-3.5"
            />
            {{ openCards }}
          </span>
        </UTooltip>

        <UButton
          icon="i-lucide-plus"
          label="New Card"
          variant="subtle"
          color="primary"
          size="xs"
          @click="openCreateCard"
        />
      </div>

      <div class="flex items-center gap-2">
        <!-- Priority quick-filters -->
        <div class="flex items-center gap-0.5 mr-1.5">
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

    <ListColumnConfigModal
      v-if="canConfigureColumns"
      v-model:open="showColumnConfig"
      :columns="columnsData"
      :tags="tagsData"
      :active-tag-filters="[...activeTagFilters]"
      :view-name="list?.name || ''"
      :view-type="'list'"
      @add="addColumn"
      @remove="removeColumn"
      @reorder="reorderColumns"
      @update-tag-filters="(ids: string[]) => { activeTagFilters = new Set(ids); updateTagFilters(ids) }"
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
      @create="handleCreateCard"
    />
  </div>
</template>
