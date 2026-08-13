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

/**
 * The width Title must never drop below.
 *
 * `table-fixed` hands every sized column its width and gives Title whatever is left —
 * and with enough columns showing, what's left is nothing. Nine columns sum to 886px of
 * fixed width, so at 1157px in a sidebar layout the Title column collapsed to about 9px:
 * the header text overlapped its neighbour and *every row rendered a blank title*. It
 * degraded silently with viewport width, which is why it survived — at 1440px there is
 * enough slack to look merely cramped.
 *
 * So the table gets a real minimum instead: `w-full` still lets Title flex out into a
 * wide screen, and below that the wrapper's `overflow-auto` scrolls horizontally rather
 * than eating the one column that carries the row's meaning.
 */
const TITLE_MIN_WIDTH = 260

const tableMinWidth = computed(() =>
  props.columns.reduce((sum, col) => sum + (parseInt(COL_WIDTHS[col.field] || '', 10) || TITLE_MIN_WIDTH), 0)
)

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
      case 'commentCount':
        cmp = (a.commentCount || 0) - (b.commentCount || 0)
        break
      case 'attachmentCount':
        cmp = (a.attachmentCount || 0) - (b.attachmentCount || 0)
        break
    }
    return (cmp * mul) || (a.id - b.id)
  })
})

// ─── Horizontal scroll affordance ───────────────────────────────────────────
// The same `.board-scroll` mask the board uses, for the same reason and a worse
// symptom: a list with enough columns ends in a hard cut through the assignee
// column, and unlike the board there is no gap between items to suggest the row
// continues — a truncated name reads as a truncated name, not as "scroll right".
// Only the edge that actually has content beyond it fades, so a table that fits
// shows nothing.
const scroller = ref<HTMLElement>()
const fadeStart = ref(0)
const fadeEnd = ref(0)

const fadeStyle = computed(() => ({
  '--board-fade-start': `${fadeStart.value}px`,
  '--board-fade-end': `${fadeEnd.value}px`
}))

function updateFade() {
  const el = scroller.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  fadeStart.value = el.scrollLeft > 4 ? 28 : 0
  fadeEnd.value = el.scrollLeft < max - 4 ? 28 : 0
}

onMounted(() => {
  updateFade()
  const el = scroller.value
  if (!el || typeof ResizeObserver === 'undefined') return
  const ro = new ResizeObserver(updateFade)
  ro.observe(el)
  onBeforeUnmount(() => ro.disconnect())
})

// Columns are added and removed from the settings dialog, which changes the
// table's width without resizing the scroller.
watch(() => props.columns.length, () => nextTick(updateFade))
</script>

<template>
  <!-- px-2 so the first and last columns are not clipped against the panel edge:
       the table was full-bleed, and at 1512px the ID header sat under the sidebar
       divider while the assignee column ran off the right. -->
  <div
    ref="scroller"
    class="flex-1 overflow-auto thin-scroll board-scroll px-2"
    :style="fadeStyle"
    @scroll="updateFade"
  >
    <table
      class="w-full border-collapse text-left table-fixed"
      :style="{ minWidth: `${tableMinWidth}px` }"
    >
      <!-- Column sizing -->
      <colgroup>
        <col
          v-for="col in columns"
          :key="col.id"
          :style="colWidth(col.field) ? { width: colWidth(col.field) } : undefined"
        >
      </colgroup>

      <!-- Header. Sortable columns are real buttons carrying aria-sort — they
           used to be bare clickable <th> elements: not focusable, no keyboard
           activation, and visually identical to unsortable ones until hover. -->
      <thead class="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
        <tr class="border-b border-default">
          <th
            v-for="col in columns"
            :key="col.id"
            scope="col"
            class="px-3 py-2 whitespace-nowrap select-none align-middle group/th text-dimmed"
            :aria-sort="localSortField === col.field
              ? (localSortDirection === 'asc' ? 'ascending' : 'descending')
              : (SORTABLE_FIELDS.has(col.field) ? 'none' : undefined)"
          >
            <!-- The type styles live on the inner element, not the th: Tailwind's
                 preflight resets `text-transform` on buttons, so sortable headers
                 rendered in sentence case while unsortable ones inherited
                 uppercase from the th. -->
            <component
              :is="SORTABLE_FIELDS.has(col.field) ? 'button' : 'span'"
              :type="SORTABLE_FIELDS.has(col.field) ? 'button' : undefined"
              class="inline-flex items-center gap-1 rounded-md text-xs font-bold uppercase tracking-[0.08em]"
              :class="[
                col.field === 'done' ? 'flex justify-center w-full min-h-[1lh] translate-y-px' : '',
                SORTABLE_FIELDS.has(col.field)
                  ? `cursor-pointer transition-colors hover:text-toned ${localSortField === col.field ? 'text-primary' : ''}`
                  : ''
              ]"
              @click="SORTABLE_FIELDS.has(col.field) && toggleSort(col.field)"
            >
              <template v-if="col.field === 'done'">
                <UIcon
                  name="i-lucide-circle-check-big"
                  class="text-xs"
                />
              </template>
              <template v-else>
                {{ fieldLabel(col.field) }}
              </template>
              <UIcon
                v-if="localSortField === col.field && localSortDirection === 'asc'"
                name="i-lucide-arrow-up"
                class="text-xs"
              />
              <UIcon
                v-else-if="localSortField === col.field && localSortDirection === 'desc'"
                name="i-lucide-arrow-down"
                class="text-xs"
              />
              <UIcon
                v-else-if="SORTABLE_FIELDS.has(col.field)"
                name="i-lucide-arrow-up-down"
                class="text-2xs opacity-0 group-hover/th:opacity-40 transition-opacity"
              />
            </component>
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

            <ListCellCount
              v-else-if="col.field === 'commentCount'"
              :count="card.commentCount"
              icon="i-lucide-message-square"
            />

            <ListCellCount
              v-else-if="col.field === 'attachmentCount'"
              :count="card.attachmentCount"
              icon="i-lucide-paperclip"
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

        <tr v-if="sortedCards.length === 0">
          <td :colspan="columns.length">
            <UEmpty
              v-if="isFiltered"
              icon="i-lucide-filter-x"
              title="No cards match these filters"
              description="Clear a filter in view settings to see more."
            />
            <UEmpty
              v-else
              icon="i-lucide-inbox"
              title="No cards yet"
              description="Add the first one and it shows up here."
              :actions="[{ label: 'New card', icon: 'i-lucide-plus', variant: 'subtle', onClick: () => emit('add-card') }]"
            />
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
