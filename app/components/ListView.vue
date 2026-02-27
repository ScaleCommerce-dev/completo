<script setup lang="ts">
const SORTABLE_FIELDS = new Set(['ticketId', 'title', 'status', 'priority', 'assignee', 'dueDate', 'createdAt', 'updatedAt'])

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const props = defineProps<{
  columns: Array<{ id: string, field: string, position: number }>
  cards: Array<{
    id: number
    title: string
    description?: string | null
    priority: string
    statusId: string
    assignee: { id: string, name: string, avatarUrl: string | null } | null
    status: { id: string, name: string, color: string | null } | null
    tags?: Array<{ id: string, name: string, color: string }>
    dueDate?: string | null
    createdAt: string
    updatedAt: string
  }>
  statuses: Array<{ id: string, name: string, color: string | null }>
  tags?: Array<{ id: string, name: string, color: string }>
  members?: Array<{ id: string, name: string, avatarUrl: string | null }>
  projectKey?: string
  projectSlug?: string
  doneStatusId?: string | null
  canConfigureColumns?: boolean
  isFiltered?: boolean
  sortField?: string | null
  sortDirection?: 'asc' | 'desc' | null
  canSaveSort?: boolean
  readOnlyFields?: string[]
}>()

type ListCard = typeof props.cards[number]

const emit = defineEmits<{
  'card-click': [card: ListCard]
  'add-card': []
  'update': [cardId: number, updates: Record<string, unknown>]
  'update-tags': [cardId: number, tagIds: string[]]
  'sort': [field: string | null, direction: 'asc' | 'desc' | null]
}>()

// Inline editing popover state
const activePopover = ref<string | null>(null)

function isPopoverOpen(cardId: number, field: string) {
  return activePopover.value === `${cardId}-${field}`
}

function setPopoverOpen(cardId: number, field: string, open: boolean) {
  activePopover.value = open ? `${cardId}-${field}` : null
}

function selectStatus(cardId: number, statusId: string) {
  emit('update', cardId, { statusId })
  activePopover.value = null
}

function selectPriority(cardId: number, priority: string) {
  emit('update', cardId, { priority })
  activePopover.value = null
}

function selectAssignee(cardId: number, assigneeId: string | null) {
  emit('update', cardId, { assigneeId })
  activePopover.value = null
}

function selectDueDate(cardId: number, date: string | null) {
  emit('update', cardId, { dueDate: date || null })
  activePopover.value = null
}

function toggleTag(card: { id: number, tags?: Array<{ id: string }> }, tagId: string) {
  const currentIds = (card.tags || []).map(t => t.id)
  const idx = currentIds.indexOf(tagId)
  const newIds = idx >= 0
    ? currentIds.filter(id => id !== tagId)
    : [...currentIds, tagId]
  emit('update-tags', card.id, newIds)
  // Don't close popover — multi-select
}

const FIELD_LABELS: Record<string, string> = {
  done: '',
  ticketId: 'ID',
  title: 'Title',
  status: 'Status',
  assignee: 'Assignee',
  priority: 'Priority',
  tags: 'Tags',
  dueDate: 'Due Date',
  createdAt: 'Created',
  updatedAt: 'Updated',
  description: 'Description'
}

const COL_WIDTHS: Record<string, string> = {
  done: '36px',
  ticketId: '72px',
  status: '130px',
  priority: '104px',
  assignee: '148px',
  tags: '160px',
  dueDate: '120px',
  createdAt: '100px',
  updatedAt: '100px',
  description: '200px'
}

function isDone(card: { statusId: string }) {
  return !!props.doneStatusId && card.statusId === props.doneStatusId
}

function toggleDone(card: { id: number, statusId: string }) {
  if (!props.doneStatusId) return
  if (isDone(card)) {
    // Uncheck: set to first non-done status
    const fallback = props.statuses.find(s => s.id !== props.doneStatusId)
    if (fallback) {
      emit('update', card.id, { statusId: fallback.id })
    }
  } else {
    // Check: set to done status
    emit('update', card.id, { statusId: props.doneStatusId })
  }
}

function fieldLabel(field: string) {
  return field in FIELD_LABELS ? FIELD_LABELS[field] : field
}

function colWidth(field: string) {
  return COL_WIDTHS[field] || undefined
}

function detailUrl(card: ListCard) {
  if (!props.projectSlug) return null
  return `/projects/${props.projectSlug}/cards/${formatTicketId(props.projectKey, card.id)}`
}

// Find priority column presence for the left-edge bar
const _hasPriorityData = computed(() => true)

// ─── Sort state ───
// undefined = user hasn't interacted (fall back to server-saved props)
// null = user explicitly cleared sort
// string = user selected a field
const userSortField = ref<string | null | undefined>(undefined)
const userSortDirection = ref<'asc' | 'desc' | null | undefined>(undefined)

const localSortField = computed(() =>
  userSortField.value !== undefined ? userSortField.value : (props.sortField || null)
)
const localSortDirection = computed(() =>
  userSortDirection.value !== undefined ? userSortDirection.value : (props.sortDirection || null)
)

function toggleSort(field: string) {
  if (!SORTABLE_FIELDS.has(field)) return
  if (localSortField.value !== field) {
    userSortField.value = field
    userSortDirection.value = 'asc'
  } else if (localSortDirection.value === 'asc') {
    userSortField.value = field
    userSortDirection.value = 'desc'
  } else {
    userSortField.value = null
    userSortDirection.value = null
  }
  emit('sort', localSortField.value, localSortDirection.value)
}

function compareDate(a: string | Date, b: string | Date): number {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

const sortedCards = computed(() => {
  const cards = [...props.cards]
  const field = localSortField.value
  const dir = localSortDirection.value
  if (!field || !dir) {
    return cards.sort((a, b) => compareDate(b.updatedAt, a.updatedAt) || (b.id - a.id))
  }
  const mul = dir === 'asc' ? 1 : -1
  return cards.sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'ticketId':
        cmp = a.id - b.id
        break
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'status':
        cmp = (a.status?.name || '').localeCompare(b.status?.name || '')
        break
      case 'priority': {
        const pa = PRIORITY_ORDER[a.priority] ?? 4
        const pb = PRIORITY_ORDER[b.priority] ?? 4
        cmp = pa - pb
        break
      }
      case 'assignee': {
        const na = a.assignee?.name || ''
        const nb = b.assignee?.name || ''
        if (!na && nb) return 1
        if (na && !nb) return -1
        cmp = na.localeCompare(nb)
        break
      }
      case 'dueDate': {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
        cmp = da - db
        break
      }
      case 'createdAt':
        cmp = compareDate(a.createdAt, b.createdAt)
        break
      case 'updatedAt':
        cmp = compareDate(a.updatedAt, b.updatedAt)
        break
    }
    return (cmp * mul) || (a.id - b.id)
  })
})
</script>

<template>
  <div class="flex-1 overflow-auto list-table-scroll">
    <table class="w-full border-collapse text-left table-fixed">
      <!-- Column sizing -->
      <colgroup>
        <col
          v-for="col in columns"
          :key="col.id"
          :style="colWidth(col.field) ? { width: colWidth(col.field) } : undefined"
        >
      </colgroup>

      <!-- Header -->
      <thead class="sticky top-0 z-10 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm">
        <tr class="border-b border-zinc-200/80 dark:border-zinc-700/50">
          <th
            v-for="col in columns"
            :key="col.id"
            class="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap select-none align-middle group/th"
            :class="[
              SORTABLE_FIELDS.has(col.field)
                ? 'cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors ' + (localSortField === col.field ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500')
                : 'text-zinc-400 dark:text-zinc-500'
            ]"
            @click="toggleSort(col.field)"
          >
            <span
              class="inline-flex items-center gap-1"
              :class="col.field === 'done' ? 'flex justify-center w-full min-h-[1lh] translate-y-px' : ''"
            >
              <template v-if="col.field === 'done'"><UIcon
                name="i-lucide-circle-check-big"
                class="text-[11px]"
              /></template>
              <template v-else>{{ fieldLabel(col.field) }}</template>
              <UIcon
                v-if="localSortField === col.field && localSortDirection === 'asc'"
                name="i-lucide-arrow-up"
                class="text-[11px]"
              />
              <UIcon
                v-else-if="localSortField === col.field && localSortDirection === 'desc'"
                name="i-lucide-arrow-down"
                class="text-[11px]"
              />
              <UIcon
                v-else-if="SORTABLE_FIELDS.has(col.field)"
                name="i-lucide-arrow-up-down"
                class="text-[10px] opacity-0 group-hover/th:opacity-40 transition-opacity"
              />
            </span>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="(card, idx) in sortedCards"
          :key="card.id"
          class="list-row group cursor-pointer"
          :class="isDone(card) ? 'list-row-done' : ''"
          :style="{ animationDelay: `${idx * 20}ms` }"
          @click="emit('card-click', card)"
        >
          <td
            v-for="(col, colIdx) in columns"
            :key="col.id"
            class="py-2 text-[14px] relative"
            :class="colIdx === 0 ? 'pl-3 pr-3' : 'px-3'"
          >
            <!-- Priority left-edge bar (on first cell only) -->
            <span
              v-if="colIdx === 0"
              class="list-row-bar"
              :style="{ backgroundColor: priorityColor(card.priority) }"
            />

            <!-- done -->
            <div
              v-if="col.field === 'done'"
              class="flex items-center justify-center"
              @click.stop
            >
              <button
                type="button"
                class="flex items-center justify-center w-[18px] h-[18px] rounded border transition-all"
                :class="isDone(card)
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 text-transparent'"
                :disabled="!doneStatusId"
                @click="toggleDone(card)"
              >
                <UIcon
                  v-if="isDone(card)"
                  name="i-lucide-check"
                  class="text-[13px]"
                />
              </button>
            </div>

            <!-- ticketId -->
            <span
              v-else-if="col.field === 'ticketId'"
              class="card-id text-zinc-500 dark:text-zinc-400 select-none"
            >
              {{ formatTicketId(projectKey, card.id) }}
            </span>

            <!-- title -->
            <div
              v-else-if="col.field === 'title'"
              class="flex items-center gap-1.5 min-w-0"
            >
              <span
                class="font-semibold truncate"
                :class="isDone(card)
                  ? 'line-through text-zinc-400 dark:text-zinc-500'
                  : 'text-zinc-900 dark:text-zinc-100'"
              >
                {{ card.title }}
              </span>
              <NuxtLink
                v-if="detailUrl(card)"
                :to="detailUrl(card) || undefined"
                class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-zinc-300 dark:text-zinc-600 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
                title="Open detail"
                @click.stop
              >
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="text-[13px]"
                />
              </NuxtLink>
            </div>

            <!-- status (read-only) -->
            <div
              v-else-if="col.field === 'status' && readOnlyFields?.includes('status')"
              class="flex items-center gap-1.5"
            >
              <template v-if="card.status">
                <span
                  class="block w-2 h-2 rounded-full shrink-0"
                  :style="{
                    backgroundColor: card.status.color || '#a1a1aa',
                    boxShadow: `inset 0 0 0 1px ${(card.status.color || '#a1a1aa')}30`
                  }"
                />
                <span class="text-zinc-600 dark:text-zinc-400 truncate text-[13.5px]">{{ card.status.name }}</span>
              </template>
              <span
                v-else
                class="text-zinc-300 dark:text-zinc-600 text-[13.5px]"
              >&mdash;</span>
            </div>

            <!-- status (editable) -->
            <UPopover
              v-else-if="col.field === 'status'"
              :open="isPopoverOpen(card.id, 'status')"
              @update:open="setPopoverOpen(card.id, 'status', $event)"
            >
              <div
                class="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                @click.stop
              >
                <template v-if="card.status">
                  <span
                    class="block w-2 h-2 rounded-full shrink-0"
                    :style="{
                      backgroundColor: card.status.color || '#a1a1aa',
                      boxShadow: `inset 0 0 0 1px ${(card.status.color || '#a1a1aa')}30`
                    }"
                  />
                  <span class="text-zinc-600 dark:text-zinc-400 truncate text-[13.5px]">{{ card.status.name }}</span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
                  />
                </template>
                <span
                  v-else
                  class="text-zinc-300 dark:text-zinc-600 text-[13.5px]"
                >&mdash;</span>
              </div>
              <template #content>
                <div class="list-popover-menu py-1 min-w-[140px]">
                  <button
                    v-for="s in statuses"
                    :key="s.id"
                    type="button"
                    class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
                    :class="card.statusId === s.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'"
                    @click="selectStatus(card.id, s.id)"
                  >
                    <span
                      class="block w-2 h-2 rounded-full shrink-0"
                      :style="{ backgroundColor: s.color || '#a1a1aa' }"
                    />
                    <span class="truncate flex-1">{{ s.name }}</span>
                    <UIcon
                      v-if="card.statusId === s.id"
                      name="i-lucide-check"
                      class="text-[13px] shrink-0 text-indigo-500"
                    />
                  </button>
                </div>
              </template>
            </UPopover>

            <!-- assignee (read-only) -->
            <div
              v-else-if="col.field === 'assignee' && readOnlyFields?.includes('assignee')"
              class="flex items-center gap-1.5 min-h-[22px]"
            >
              <template v-if="card.assignee">
                <UAvatar
                  :alt="card.assignee.name"
                  size="3xs"
                />
                <span class="text-zinc-500 dark:text-zinc-400 truncate text-[13.5px]">{{ card.assignee.name }}</span>
              </template>
              <span
                v-else
                class="text-zinc-300 dark:text-zinc-600 text-[13px]"
              >Unassigned</span>
            </div>

            <!-- assignee (editable) -->
            <UPopover
              v-else-if="col.field === 'assignee'"
              :open="isPopoverOpen(card.id, 'assignee')"
              @update:open="setPopoverOpen(card.id, 'assignee', $event)"
            >
              <div
                class="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer min-h-[22px]"
                @click.stop
              >
                <template v-if="card.assignee">
                  <UAvatar
                    :alt="card.assignee.name"
                    size="3xs"
                  />
                  <span class="text-zinc-500 dark:text-zinc-400 truncate text-[13.5px]">{{ card.assignee.name }}</span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
                  />
                </template>
                <span
                  v-else
                  class="text-zinc-300 dark:text-zinc-600 text-[13px]"
                >Unassigned</span>
              </div>
              <template #content>
                <div class="list-popover-menu py-1 min-w-[160px]">
                  <button
                    type="button"
                    class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
                    :class="!card.assignee
                      ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'"
                    @click="selectAssignee(card.id, null)"
                  >
                    <UIcon
                      name="i-lucide-user-x"
                      class="text-[13px] text-zinc-400 shrink-0"
                    />
                    <span class="flex-1">Unassigned</span>
                    <UIcon
                      v-if="!card.assignee"
                      name="i-lucide-check"
                      class="text-[13px] shrink-0 text-indigo-500"
                    />
                  </button>
                  <button
                    v-for="m in members"
                    :key="m.id"
                    type="button"
                    class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
                    :class="card.assignee?.id === m.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'"
                    @click="selectAssignee(card.id, m.id)"
                  >
                    <UAvatar
                      :alt="m.name"
                      size="3xs"
                    />
                    <span class="truncate flex-1">{{ m.name }}</span>
                    <UIcon
                      v-if="card.assignee?.id === m.id"
                      name="i-lucide-check"
                      class="text-[13px] shrink-0 text-indigo-500"
                    />
                  </button>
                </div>
              </template>
            </UPopover>

            <!-- priority -->
            <UPopover
              v-else-if="col.field === 'priority'"
              :open="isPopoverOpen(card.id, 'priority')"
              @update:open="setPopoverOpen(card.id, 'priority', $event)"
            >
              <div
                class="flex items-center gap-1 text-[13px] font-medium capitalize rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                :class="card.priority === 'urgent' ? 'priority-urgent-pulse' : ''"
                :style="{ color: priorityColor(card.priority) }"
                @click.stop
              >
                <UIcon
                  :name="priorityIcon(card.priority)"
                  class="text-[13px]"
                />
                <span>{{ card.priority }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="text-[10px] shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                />
              </div>
              <template #content>
                <div class="list-popover-menu py-1 min-w-[130px]">
                  <button
                    v-for="p in PRIORITIES"
                    :key="p.value"
                    type="button"
                    class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] font-medium capitalize transition-colors"
                    :class="card.priority === p.value
                      ? 'bg-indigo-50 dark:bg-indigo-950/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'"
                    :style="{ color: p.color }"
                    @click="selectPriority(card.id, p.value)"
                  >
                    <UIcon
                      :name="p.icon"
                      class="text-[13px] shrink-0"
                    />
                    <span class="flex-1">{{ p.label }}</span>
                    <UIcon
                      v-if="card.priority === p.value"
                      name="i-lucide-check"
                      class="text-[13px] shrink-0 text-indigo-500"
                    />
                  </button>
                </div>
              </template>
            </UPopover>

            <!-- tags (read-only) -->
            <div
              v-else-if="col.field === 'tags' && (!tags?.length || readOnlyFields?.includes('tags'))"
              class="flex flex-wrap gap-1"
            >
              <TagPill
                v-for="tag in (card.tags || [])"
                :key="tag.id"
                :name="tag.name"
                :color="tag.color"
              />
            </div>

            <!-- tags (editable) -->
            <UPopover
              v-else-if="col.field === 'tags'"
              :open="isPopoverOpen(card.id, 'tags')"
              @update:open="setPopoverOpen(card.id, 'tags', $event)"
            >
              <div
                class="flex flex-wrap gap-1 items-center rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer min-h-[22px]"
                @click.stop
              >
                <template v-if="card.tags?.length">
                  <TagPill
                    v-for="tag in card.tags"
                    :key="tag.id"
                    :name="tag.name"
                    :color="tag.color"
                  />
                </template>
                <span
                  v-else
                  class="text-zinc-300 dark:text-zinc-600 text-[13px]"
                >No tags</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
                />
              </div>
              <template #content>
                <TagToggleList
                  class="list-popover-menu"
                  :tags="tags || []"
                  :selected-ids="(card.tags || []).map(t => t.id)"
                  @toggle="toggleTag(card, $event)"
                />
              </template>
            </UPopover>

            <!-- dueDate -->
            <DueDatePicker
              v-else-if="col.field === 'dueDate'"
              :model-value="card.dueDate"
              :open="isPopoverOpen(card.id, 'dueDate')"
              @update:open="setPopoverOpen(card.id, 'dueDate', $event)"
              @update:model-value="selectDueDate(card.id, $event)"
            >
              <div
                class="flex items-center gap-1 rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-[13px] font-mono tabular-nums"
                :style="card.dueDate ? { color: dueDateColor(getDueDateStatus(card.dueDate)) } : {}"
                @click.stop
              >
                <template v-if="card.dueDate">
                  <UIcon
                    :name="dueDateIcon(getDueDateStatus(card.dueDate))"
                    class="text-[12px]"
                  />
                  <span>{{ formatDueDate(card.dueDate) }}</span>
                </template>
                <span
                  v-else
                  class="text-zinc-300 dark:text-zinc-600"
                >&mdash;</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
                />
              </div>
            </DueDatePicker>

            <!-- createdAt / updatedAt -->
            <span
              v-else-if="col.field === 'createdAt' || col.field === 'updatedAt'"
              class="text-zinc-400 dark:text-zinc-500 text-[13px] font-mono tabular-nums"
            >
              {{ relativeTime(col.field === 'createdAt' ? card.createdAt : card.updatedAt) }}
            </span>

            <!-- description -->
            <span
              v-else-if="col.field === 'description'"
              class="text-zinc-400 dark:text-zinc-500 text-[13px] line-clamp-1"
            >
              {{ card.description ? stripMarkdown(card.description) : '' }}
            </span>
          </td>
        </tr>

        <!-- Empty state: filtered -->
        <tr v-if="sortedCards.length === 0 && isFiltered">
          <td
            :colspan="columns.length"
            class="text-center py-16"
          >
            <div class="flex flex-col items-center gap-2">
              <UIcon
                name="i-lucide-filter-x"
                class="text-2xl text-zinc-300 dark:text-zinc-600"
              />
              <p class="text-[13px] text-zinc-400 dark:text-zinc-500">
                No cards match the active filters
              </p>
            </div>
          </td>
        </tr>

        <!-- Empty state: no cards -->
        <tr v-else-if="sortedCards.length === 0">
          <td
            :colspan="columns.length"
            class="text-center py-16"
          >
            <div class="flex flex-col items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <UIcon
                  name="i-lucide-inbox"
                  class="text-xl text-zinc-400 dark:text-zinc-500"
                />
              </div>
              <div>
                <p class="text-[14px] font-medium text-zinc-500 dark:text-zinc-400">
                  No cards yet
                </p>
                <p class="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Get started by creating your first card
                </p>
              </div>
              <button
                type="button"
                class="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-indigo-500 hover:text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-all"
                @click="emit('add-card')"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="text-[13px]"
                />
                New Card
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* ─── Row styles ─── */
.list-row {
  border-bottom: 1px solid oklch(0.92 0 0 / 0.8);
  transition: background-color 0.1s ease;
  animation: list-row-enter 0.25s cubic-bezier(0.4, 0, 0.2, 1) both;
}
:is(.dark) .list-row {
  border-bottom-color: oklch(0.28 0 0 / 0.6);
}
.list-row:nth-child(even) {
  background: oklch(0.98 0 0 / 0.6);
}
:is(.dark) .list-row:nth-child(even) {
  background: oklch(0.18 0 0 / 0.4);
}
.list-row:hover {
  background: oklch(0.96 0.008 260);
}
:is(.dark) .list-row:hover {
  background: oklch(0.22 0.01 260);
}

/* ─── Done row dimming ─── */
.list-row-done {
  opacity: 0.5;
}
.list-row-done:hover {
  opacity: 0.75;
}

/* ─── Priority left-edge bar ─── */
.list-row-bar {
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2.5px;
  border-radius: 0 2px 2px 0;
  opacity: 0.35;
  transition: opacity 0.15s ease, width 0.15s ease;
}
.list-row:hover .list-row-bar {
  opacity: 0.85;
  width: 3px;
}

/* ─── Staggered row entrance ─── */
@keyframes list-row-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ─── Ticket ID legibility ─── */
.list-row .card-id {
  opacity: 0.7;
  font-size: 11.5px;
}
.list-row:hover .card-id {
  opacity: 0.9;
}

/* ─── Thin scrollbar ─── */
.list-table-scroll {
  scrollbar-width: thin;
  scrollbar-color: oklch(0.6 0 0 / 0.12) transparent;
}
.list-table-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
.list-table-scroll::-webkit-scrollbar-track { background: transparent; }
.list-table-scroll::-webkit-scrollbar-thumb {
  background: oklch(0.6 0 0 / 0.12);
  border-radius: 99px;
}
</style>

<style>
/* ─── Remove popover auto-focus ring (unscoped — teleported content) ─── */
.list-popover-menu button:focus,
.list-popover-menu button:focus-visible {
  outline: none;
}
</style>
