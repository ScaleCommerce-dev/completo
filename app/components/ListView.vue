<script setup lang="ts">
import type { CardWithStatus, CardStatus, Tag, Member } from '~/types/card'
// Explicit import: shared/utils is auto-imported for Nitro but not into app components.
import { SORTABLE_LIST_FIELDS, LIST_FIELD_LABELS, LIST_FIELD_WIDTHS } from '#shared/utils/list-fields'

const SORTABLE_FIELDS = SORTABLE_LIST_FIELDS

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const props = defineProps<{
  columns: Array<{ id: string, field: string, position: number }>
  cards: Array<Omit<CardWithStatus, 'projectId'> & { projectId?: string }>
  statuses: CardStatus[]
  tags?: Tag[]
  members?: Member[]
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
}

const FIELD_LABELS = LIST_FIELD_LABELS
const COL_WIDTHS = LIST_FIELD_WIDTHS

function isDone(card: { statusId: string }) {
  return !!props.doneStatusId && card.statusId === props.doneStatusId
}

function toggleDone(card: { id: number, statusId: string }) {
  if (!props.doneStatusId) return
  if (isDone(card)) {
    const fallback = props.statuses.find(s => s.id !== props.doneStatusId)
    if (fallback) {
      emit('update', card.id, { statusId: fallback.id })
    }
  } else {
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

// ─── Sort state ───
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
      case 'assignee':
      case 'creator': {
        const na = (field === 'assignee' ? a.assignee?.name : a.creator?.name) || ''
        const nb = (field === 'assignee' ? b.assignee?.name : b.creator?.name) || ''
        // Nameless rows sort last in both directions — return before `mul` is applied.
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
  <div class="flex-1 overflow-auto thin-scroll">
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
      <thead class="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
        <tr class="border-b border-default">
          <th
            v-for="col in columns"
            :key="col.id"
            class="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap select-none align-middle group/th"
            :class="[
              SORTABLE_FIELDS.has(col.field)
                ? 'cursor-pointer hover:text-toned transition-colors' + (localSortField === col.field ? 'text-primary' : 'text-dimmed')
                : 'text-dimmed'
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
          v-for="card in sortedCards"
          :key="card.id"
          class="list-row group cursor-pointer"
          :class="isDone(card) ? 'list-row-done' : ''"
          @click="emit('card-click', card)"
        >
          <td
            v-for="(col, colIdx) in columns"
            :key="col.id"
            class="py-2 text-base relative"
            :class="colIdx === 0 ? 'pl-3 pr-3' : 'px-3'"
          >
            <!-- Priority edge bar, first cell only. Rendered only for high and
                 urgent — an unremarkable card carries no marks. -->
            <span
              v-if="colIdx === 0 && priorityBarClass(card.priority)"
              class="list-row-bar"
              :class="priorityBarClass(card.priority)"
            />

            <ListCellDone
              v-if="col.field === 'done'"
              :is-done="isDone(card)"
              :disabled="!doneStatusId"
              @toggle="toggleDone(card)"
            />

            <ListCellTicketId
              v-else-if="col.field === 'ticketId'"
              :project-key="projectKey"
              :project-slug="projectSlug"
              :card-id="card.id"
            />

            <ListCellTitle
              v-else-if="col.field === 'title'"
              :title="card.title"
              :is-done="isDone(card)"
              :detail-url="detailUrl(card)"
            />

            <ListCellStatus
              v-else-if="col.field === 'status'"
              :status="card.status"
              :status-id="card.statusId"
              :statuses="statuses"
              :read-only="readOnlyFields?.includes('status')"
              :popover-open="isPopoverOpen(card.id, 'status')"
              @select="selectStatus(card.id, $event)"
              @update:popover-open="setPopoverOpen(card.id, 'status', $event)"
            />

            <ListCellAssignee
              v-else-if="col.field === 'assignee'"
              :assignee="card.assignee"
              :members="members"
              :read-only="readOnlyFields?.includes('assignee')"
              :popover-open="isPopoverOpen(card.id, 'assignee')"
              @select="selectAssignee(card.id, $event)"
              @update:popover-open="setPopoverOpen(card.id, 'assignee', $event)"
            />

            <ListCellCreator
              v-else-if="col.field === 'creator'"
              :creator="card.creator"
            />

            <ListCellPriority
              v-else-if="col.field === 'priority'"
              :priority="card.priority"
              :popover-open="isPopoverOpen(card.id, 'priority')"
              @select="selectPriority(card.id, $event)"
              @update:popover-open="setPopoverOpen(card.id, 'priority', $event)"
            />

            <ListCellTags
              v-else-if="col.field === 'tags'"
              :card-tags="card.tags || []"
              :tags="tags"
              :read-only="readOnlyFields?.includes('tags')"
              :popover-open="isPopoverOpen(card.id, 'tags')"
              @toggle="toggleTag(card, $event)"
              @update:popover-open="setPopoverOpen(card.id, 'tags', $event)"
            />

            <ListCellDueDate
              v-else-if="col.field === 'dueDate'"
              :due-date="card.dueDate"
              :popover-open="isPopoverOpen(card.id, 'dueDate')"
              @select="selectDueDate(card.id, $event)"
              @update:popover-open="setPopoverOpen(card.id, 'dueDate', $event)"
            />

            <ListCellTimestamp
              v-else-if="col.field === 'createdAt' || col.field === 'updatedAt'"
              :value="col.field === 'createdAt' ? card.createdAt : card.updatedAt"
            />

            <ListCellDescription
              v-else-if="col.field === 'description'"
              :description="card.description"
            />
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
                class="text-2xl text-dimmed"
              />
              <p class="text-[13px] text-dimmed">
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
              <div class="w-10 h-10 rounded-xl bg-elevated flex items-center justify-center">
                <UIcon
                  name="i-lucide-inbox"
                  class="text-xl text-dimmed"
                />
              </div>
              <div>
                <p class="text-[14px] font-medium text-muted">
                  No cards yet
                </p>
                <p class="text-[12px] text-dimmed mt-0.5">
                  Get started by creating your first card
                </p>
              </div>
              <button
                type="button"
                class="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-primary hover:text-primary bg-primary/10 hover:bg-primary/15 transition-all"
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
/* ─── Rows ───────────────────────────────────────────────────────────────────
   No zebra striping. At this row height stripes read as noise rather than as
   structure, and the previous implementation was light-mode oklch math that
   inverted in dark mode. A hairline plus a clear hover does the same job with
   less ink — and there is now nothing theme-specific left to get wrong.

   The entrance animation was also removed from this rule: it was unconditional,
   so every inline field edit triggered a refetch that re-animated every row. */
.list-row {
  border-bottom: 1px solid var(--ui-border);
  transition: background-color 0.1s ease;
}
.list-row:hover {
  background: var(--ui-bg-muted);
}

/* Done rows recede but stay readable — ListCellTitle already strikes the title
   through, so the dimming does not need to carry the signal on its own. */
.list-row-done {
  opacity: 0.62;
}
.list-row-done:hover {
  opacity: 0.85;
}

/* ─── Priority left-edge bar ───────────────────────────────────────────────
   Mirrored by KanbanCard so priority reads the same way in both views. */
.list-row-bar {
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2.5px;
  border-radius: 0 2px 2px 0;
  opacity: 0.5;
  transition: opacity 0.15s ease, width 0.15s ease;
}
.list-row:hover .list-row-bar {
  opacity: 1;
  width: 3px;
}

.list-row .card-id {
  opacity: 0.75;
}
.list-row:hover .card-id {
  opacity: 1;
}
</style>
