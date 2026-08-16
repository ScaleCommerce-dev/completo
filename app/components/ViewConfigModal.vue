<script setup lang="ts">
// Explicit import: shared/utils is auto-imported for Nitro but not into app components.
import { LIST_FIELDS } from '#shared/utils/list-fields'
import { CARD_FIELDS, type CardField } from '#shared/utils/card-fields'

const draggable = defineAsyncComponent(() => import('vuedraggable'))

interface ColumnItem {
  id: string
  name?: string
  color?: string | null
  position?: number
  field?: string
}

const props = defineProps<{
  mode: 'board' | 'list'
  columns: ColumnItem[]
  availableColumns?: ColumnItem[]
  canAddColumns?: boolean
  tags?: Array<{ id: string, name: string, color: string }>
  statuses?: Array<{ id: string, name: string, color: string | null }>
  members?: Array<{ id: string, name: string, avatarUrl: string | null }>
  activeTagFilters?: string[]
  activeStatusFilters?: string[]
  activeAssigneeFilters?: string[]
  activePriorityFilters?: string[]
  /** Board mode only — whether cards show a description excerpt. */
  hiddenCardFields?: string[]
  viewName?: string
  viewType?: 'board' | 'list'
  /**
   * Owned by the parent, because the parent is what does the deleting.
   * `delete-view` is a fire-and-forget emit, so a pending flag kept in here had
   * no way to learn that the request failed: it only ever reset on the next
   * open, leaving the dialog sitting behind a spinner that would never stop.
   */
  deletingView?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  'add': [nameOrField: string, color?: string]
  'update': [columnId: string, updates: { name?: string, color?: string }]
  'delete': [columnId: string]
  'reorder': [columns: { id: string, position: number }[]]
  'link': [statusId: string]
  'update-filters': [filters: { tagFilters?: string[], statusFilters?: string[], assigneeFilters?: string[], priorityFilters?: string[] }]
  'update-display': [display: { hiddenCardFields: string[] }]
  'rename': [name: string]
  'delete-view': []
}>()

// ─── List-mode field metadata (shared/utils/list-fields.ts) ───
const ALL_FIELDS = LIST_FIELDS

const activeFields = computed(() => new Set(localColumns.value.map(c => c.field)))
const availableFields = computed(() =>
  ALL_FIELDS.filter(f => !activeFields.value.has(f.field))
)

function fieldLabel(field: string) {
  return ALL_FIELDS.find(f => f.field === field)?.label || field
}

function fieldIcon(field: string) {
  return ALL_FIELDS.find(f => f.field === field)?.icon || 'i-lucide-columns-3'
}

const memberItems = computed(() =>
  (props.members || []).map(m => ({ value: m.id, label: m.name }))
)

/**
 * Closed sets get chips; open-ended sets get a search field.
 *
 * Status and priority are short, fixed lists where a row of toggles is the fastest
 * control there is. Tags and members grow without limit — thirteen tag chips already
 * wrapped onto three lines and turned the filter section into its own wall of colour, and
 * a project with fifty tags would have been unusable. A `UiStatusDot` in the item slot
 * carries the tag colour, so nothing is lost but the wrapping — USelectMenu's own `chip`
 * prop only takes the semantic palette names, never a user-chosen hex.
 */
const tagItems = computed(() =>
  (props.tags || []).map(t => ({ value: t.id, label: t.name, color: t.color }))
)

function toggleStatusFilter(value: string) {
  const idx = localStatusFilters.value.indexOf(value)
  localStatusFilters.value = idx >= 0
    ? localStatusFilters.value.filter(v => v !== value)
    : [...localStatusFilters.value, value]
}

function togglePriorityFilter(value: string) {
  const idx = localPriorityFilters.value.indexOf(value)
  localPriorityFilters.value = idx >= 0
    ? localPriorityFilters.value.filter(v => v !== value)
    : [...localPriorityFilters.value, value]
}

/**
 * Filtering is a capability of the surface, not a section of this dialog.
 *
 * The priority chips need no props to render, so the Filters tab drew itself on
 * every consumer — including My Tasks, which has nowhere to persist a filter and
 * does not listen for `update-filters`. Toggling "Urgent" there enabled Save,
 * and Save closed the dialog having emitted into nothing: no filter, no error.
 *
 * Keyed on the filter state itself, the same device `viewName` uses for rename
 * and delete. It is not arbitrary — a surface that passes no `active*Filters`
 * has nothing to seed the local refs from, so the tab could not work even if it
 * were wired. Pass any one of them and the tab returns.
 */
const filterable = computed(() =>
  props.activeTagFilters !== undefined
  || props.activeStatusFilters !== undefined
  || props.activeAssigneeFilters !== undefined
  || props.activePriorityFilters !== undefined)

// ─── Local state — buffered until Save ───
const localColumns = ref<ColumnItem[]>([])
const localTagFilters = ref<string[]>([])
const localStatusFilters = ref<string[]>([])
const localAssigneeFilters = ref<string[]>([])
const localPriorityFilters = ref<string[]>([])
const localHiddenFields = ref<string[]>([])
const editName = ref('')

// Snapshot on open to detect changes
const snapshotColumnOrder = ref<string[]>([])
const snapshotTagFilters = ref<string[]>([])
const snapshotStatusFilters = ref<string[]>([])
const snapshotAssigneeFilters = ref<string[]>([])
const snapshotPriorityFilters = ref<string[]>([])
const snapshotHiddenFields = ref<string[]>([])

/**
 * The switches read as "show X", so they are the inverse of what is stored —
 * see `card-fields.ts` for why the *hidden* set is what persists.
 */
function fieldShown(key: CardField) {
  return !localHiddenFields.value.includes(key)
}

function setFieldShown(key: CardField, shown: boolean) {
  localHiddenFields.value = shown
    ? localHiddenFields.value.filter(k => k !== key)
    : [...localHiddenFields.value, key]
}

// Order-insensitive: toggling a field off and on again is not a change to save.
const hiddenFieldsChanged = computed(() => {
  const before = [...snapshotHiddenFields.value].sort().join(',')
  return before !== [...localHiddenFields.value].sort().join(',')
})
const snapshotName = ref('')

function resetToProps() {
  localColumns.value = [...props.columns]
  localTagFilters.value = [...(props.activeTagFilters || [])]
  localStatusFilters.value = [...(props.activeStatusFilters || [])]
  localAssigneeFilters.value = [...(props.activeAssigneeFilters || [])]
  localPriorityFilters.value = [...(props.activePriorityFilters || [])]
  localHiddenFields.value = [...(props.hiddenCardFields || [])]
  editName.value = props.viewName || ''
  snapshotColumnOrder.value = props.columns.map(c => c.id)
  snapshotTagFilters.value = [...(props.activeTagFilters || [])]
  snapshotStatusFilters.value = [...(props.activeStatusFilters || [])]
  snapshotAssigneeFilters.value = [...(props.activeAssigneeFilters || [])]
  snapshotPriorityFilters.value = [...(props.activePriorityFilters || [])]
  snapshotHiddenFields.value = [...(props.hiddenCardFields || [])]
  snapshotName.value = props.viewName || ''
}

/**
 * Columns and filters are two jobs, not one scroll.
 *
 * This dialog put a name field, a drag-to-reorder column list, an add-column form, a list
 * of linkable columns, and four filter controls — thirteen tag chips among them — in one
 * column, so reordering a board meant scrolling past the filter section and configuring a
 * filter meant scrolling past the columns. Two tabs, with the name above them because it
 * belongs to the view itself rather than to either job.
 *
 * `unmountOnHide: false` keeps both panels mounted. The columns panel holds a
 * `vuedraggable` instance behind `<ClientOnly>`; tearing that down and rebuilding it on
 * every tab switch is work with nothing to show for it.
 */
const configTab = ref<'columns' | 'filters' | 'display'>('columns')

/** Shown on the Filters tab, so an active filter is visible without opening the tab. */
const activeFilterCount = computed(() =>
  localStatusFilters.value.length
  + localPriorityFilters.value.length
  + localTagFilters.value.length
  + localAssigneeFilters.value.length
)

/**
 * "Display", not "Settings" or "View" — the dialog is already the view's
 * settings, so either of those would name the dialog a second time. It isn't
 * "Cards" either: what belongs here next is WIP limits and swimlanes, which are
 * properties of the board rather than of a card.
 *
 * Board-only for now. A list controls its description through the Description
 * field column, so there is nothing to put here for one, and an empty tab is
 * worse than an absent one.
 */
const tabItems = computed(() => [
  {
    // A board reorders statuses; a list reorders which card fields it shows.
    label: props.mode === 'board' ? 'Columns' : 'Fields',
    value: 'columns' as const,
    slot: 'columns' as const,
    icon: 'i-lucide-columns-3',
    count: localColumns.value.length
  },
  ...(filterable.value
    ? [{
        label: 'Filters',
        value: 'filters' as const,
        slot: 'filters' as const,
        icon: 'i-lucide-filter',
        count: activeFilterCount.value
      }]
    : []),
  ...(props.mode === 'board'
    ? [{
        label: 'Display',
        value: 'display' as const,
        slot: 'display' as const,
        icon: 'i-lucide-sliders-horizontal',
        // No count: unlike columns and filters there is no quantity here, and a
        // badge reading "1" for "one option is switched off" reads as a warning.
        count: 0
      }]
    : [])
])

watch(open, (isOpen) => {
  if (isOpen) {
    resetToProps()
    showDeleteConfirm.value = false
    deleteConfirmName.value = ''
    showCloseWarning.value = false
    // Always open on Columns rather than wherever you were last time.
    configTab.value = 'columns'
  }
})

/**
 * Re-sync when the columns change underneath us — add, delete, link and colour
 * apply immediately and refresh the view, unlike order, filters and name, which
 * buffer until Save. That split is the dialog's real awkwardness: the instant
 * actions are the ones that need a server id back, and Save exists for the ones
 * that don't.
 *
 * What made it a bug rather than an inconsistency is that this used to replace
 * `localColumns` *and* `snapshotColumnOrder` wholesale. Reorder three columns,
 * then recolour one — the recolour refreshed `props.columns`, this fired, and
 * the reorder was gone with `isDirty` back to false, so Save was disabled and
 * nothing said why.
 *
 * So the incoming set wins on *membership* and the local list keeps its
 * *order*: ids the user has arranged stay arranged, ids that appeared are
 * appended, ids that went away are dropped. The snapshot takes the server's
 * order, which is what a pending reorder should be measured against.
 */
watch(() => props.columns, (cols) => {
  if (!open.value) return
  const incoming = cols.map(c => c.id)
  const arranged = localColumns.value.map(c => c.id).filter(id => incoming.includes(id))
  const appended = incoming.filter(id => !arranged.includes(id))

  localColumns.value = [...arranged, ...appended]
    .map(id => cols.find(c => c.id === id))
    .filter((c): c is ColumnItem => !!c)
  snapshotColumnOrder.value = incoming
}, { immediate: true })

function onDragEnd() {
  // Just reorder locally — emitted on save
}

// ─── Board-mode: new column ───
const newColumnName = ref('')
const newColumnColor = ref('#6366f1')
const newColorOpen = ref(false)

function addBoardColumn() {
  if (!newColumnName.value.trim()) return
  emit('add', newColumnName.value.trim(), newColumnColor.value)
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

// Track which column's color popover is open
const colorPopoverOpen = ref<Record<string, boolean>>({})

function pickColor(colId: string, color: string) {
  colorPopoverOpen.value[colId] = false
  emit('update', colId, { color })
}

// ─── Dirty detection ───
function filtersChanged(current: string[], snapshot: string[]) {
  const a = [...current].sort()
  const b = [...snapshot].sort()
  return a.length !== b.length || a.some((id, i) => id !== b[i])
}

/** A rename to nothing is not a rename — `save` skips it, so it cannot count. */
const nameChanged = computed(() => {
  const trimmed = editName.value.trim()
  return !!trimmed && trimmed !== snapshotName.value
})

const isDirty = computed(() => {
  if (nameChanged.value) return true
  const currentOrder = localColumns.value.map(c => c.id)
  if (currentOrder.length !== snapshotColumnOrder.value.length
    || currentOrder.some((id, i) => id !== snapshotColumnOrder.value[i])) return true
  if (filtersChanged(localTagFilters.value, snapshotTagFilters.value)) return true
  if (filtersChanged(localStatusFilters.value, snapshotStatusFilters.value)) return true
  if (filtersChanged(localAssigneeFilters.value, snapshotAssigneeFilters.value)) return true
  if (filtersChanged(localPriorityFilters.value, snapshotPriorityFilters.value)) return true
  if (hiddenFieldsChanged.value) return true
  return false
})

// ─── Save — emit only what changed ───
function save() {
  if (!isDirty.value) {
    open.value = false
    return
  }

  // Emptying the field used to enable Save, and Save then closed the dialog
  // having skipped the rename — no view renamed, nothing said. It no longer
  // counts as a change, and the field goes back to the name the view actually
  // has so the dialog never closes showing one it does not.
  if (nameChanged.value) emit('rename', editName.value.trim())
  else editName.value = snapshotName.value

  const currentOrder = localColumns.value.map(c => c.id)
  const orderChanged = currentOrder.length !== snapshotColumnOrder.value.length
    || currentOrder.some((id, i) => id !== snapshotColumnOrder.value[i])
  if (orderChanged) {
    emit('reorder', localColumns.value.map((c, i) => ({ id: c.id, position: i })))
  }

  const filterUpdates: { tagFilters?: string[], statusFilters?: string[], assigneeFilters?: string[], priorityFilters?: string[] } = {}
  if (filtersChanged(localTagFilters.value, snapshotTagFilters.value)) {
    filterUpdates.tagFilters = [...localTagFilters.value]
  }
  if (filtersChanged(localStatusFilters.value, snapshotStatusFilters.value)) {
    filterUpdates.statusFilters = [...localStatusFilters.value]
  }
  if (filtersChanged(localAssigneeFilters.value, snapshotAssigneeFilters.value)) {
    filterUpdates.assigneeFilters = [...localAssigneeFilters.value]
  }
  if (filtersChanged(localPriorityFilters.value, snapshotPriorityFilters.value)) {
    filterUpdates.priorityFilters = [...localPriorityFilters.value]
  }
  if (Object.keys(filterUpdates).length) {
    emit('update-filters', filterUpdates)
  }

  if (hiddenFieldsChanged.value) {
    emit('update-display', { hiddenCardFields: [...localHiddenFields.value] })
  }

  open.value = false
}

const showCloseWarning = ref(false)

function close() {
  if (isDirty.value) {
    showCloseWarning.value = true
    return
  }
  open.value = false
}

/**
 * Every way out of this dialog goes through `close()`.
 *
 * With `v-model:open` the footer button was the only one that did: Escape and a
 * click on the overlay set the model straight to false, so the discard warning
 * was a guard on one exit out of three, and the two that skipped it were the
 * two you hit by accident. An unsaved reorder, filter set or rename went
 * silently.
 *
 * Controlled rather than `dismissible: false`, because the goal is not to trap
 * the dialog — a clean one still closes on the first Escape.
 */
function onOpenChange(next: boolean) {
  if (next) open.value = true
  else close()
}

function discardAndClose() {
  showCloseWarning.value = false
  open.value = false
}

// ─── Delete view — inline confirmation ───
const showDeleteConfirm = ref(false)
const deleteConfirmName = ref('')

const deleteConfirmValid = computed(() =>
  deleteConfirmName.value.trim() === (props.viewName || '').trim()
)

function handleDeleteView() {
  if (!deleteConfirmValid.value) return
  emit('delete-view')
}
</script>

<template>
  <UModal
    :open="open"
    :ui="{ header: 'hidden', body: 'pt-0 sm:pt-0', footer: 'p-0 sm:p-0' }"
    @update:open="onOpenChange"
  >
    <template #body>
      <div class="flex flex-col gap-1">
        <!-- Name -->
        <template v-if="viewName !== undefined">
          <UiSectionLabel
            icon="i-lucide-type"
            label="Name"
            class="mb-1 pt-5"
          />
          <UInput
            v-model="editName"
            :placeholder="mode === 'board' ? 'Board name...' : 'List name...'"
            size="sm"
            class="mb-1"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
        </template>

        <UTabs
          v-model="configTab"
          :items="tabItems"
          variant="link"
          size="sm"
          :unmount-on-hide="false"
          :ui="{
            root: 'gap-0 items-stretch',
            list: 'px-0',
            trigger: 'grow-0',
            content: 'pt-3 pb-1'
          }"
          :class="viewName === undefined ? 'pt-5' : 'pt-2'"
        >
          <!-- A count beside each tab: how many columns this view shows, and whether
               anything is being filtered out — the latter was previously invisible
               until you scrolled to the bottom of the dialog. -->
          <template #trailing="{ item }">
            <span
              v-if="item.count"
              class="text-2xs font-mono tabular-nums"
              :class="configTab === item.value ? 'text-primary' : 'text-dimmed'"
            >{{ item.count }}</span>
          </template>

          <template #columns>
            <ClientOnly>
              <draggable
                v-model="localColumns"
                item-key="id"
                handle=".drag-handle"
                ghost-class="sortable-ghost"
                chosen-class="sortable-chosen"
                drag-class="sortable-drag"
                @end="onDragEnd"
              >
                <template #item="{ element: col }">
                  <div
                    class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <UIcon
                      name="i-lucide-grip-vertical"
                      class="drag-handle text-dimmed hover:text-muted cursor-grab active:cursor-grabbing text-base shrink-0 transition-colors"
                    />
                    <!-- Board mode: color dot (editable if canAddColumns) -->
                    <template v-if="mode === 'board'">
                      <UPopover
                        v-if="canAddColumns"
                        v-model:open="colorPopoverOpen[col.id]"
                      >
                        <button
                          type="button"
                          class="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-primary transition cursor-pointer"
                          :style="{ backgroundColor: col.color || '#a1a1aa' }"
                        />
                        <template #content>
                          <div class="p-2">
                            <ColorPicker
                              :model-value="col.color || '#a1a1aa'"
                              @update:model-value="pickColor(col.id, $event)"
                            />
                          </div>
                        </template>
                      </UPopover>
                      <div
                        v-else
                        class="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                        :style="{ backgroundColor: col.color || '#a1a1aa' }"
                      />
                    </template>
                    <!-- List mode: field icon -->
                    <UIcon
                      v-if="mode === 'list'"
                      :name="fieldIcon(col.field || '')"
                      class="text-base text-dimmed shrink-0"
                    />
                    <span class="text-base font-medium flex-1">
                      {{ mode === 'board' ? col.name : fieldLabel(col.field || '') }}
                    </span>
                    <div class="flex items-center gap-0.5 opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-60 transition-opacity">
                      <UTooltip text="Remove column">
                        <UButton
                          icon="i-lucide-trash-2"
                          variant="ghost"
                          color="error"
                          size="xs"
                          @click="emit('delete', col.id)"
                        />
                      </UTooltip>
                    </div>
                  </div>
                </template>
              </draggable>
            </ClientOnly>

            <!-- Board mode: add new column -->
            <form
              v-if="mode === 'board' && canAddColumns"
              class="flex items-center gap-2"
              @submit.prevent="addBoardColumn"
            >
              <UPopover v-model:open="newColorOpen">
                <button
                  type="button"
                  class="w-5 h-5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-primary transition cursor-pointer"
                  :style="{ backgroundColor: newColumnColor }"
                />
                <template #content>
                  <div class="p-2">
                    <ColorPicker v-model="newColumnColor" />
                  </div>
                </template>
              </UPopover>
              <UInput
                v-model="newColumnName"
                placeholder="New column name (project-wide)"
                class="flex-1"
                size="sm"
              />
              <UButton
                type="submit"
                icon="i-lucide-plus"
                label="Add"
                size="sm"
              />
            </form>

            <!-- Board mode: available columns to link -->
            <template v-if="mode === 'board' && availableColumns?.length">
              <UiSectionLabel
                icon="i-lucide-plus-circle"
                label="Available columns"
                class="mt-3 pt-3 border-t border-muted"
              />
              <div
                v-for="col in availableColumns"
                :key="col.id"
                class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors group"
              >
                <div
                  class="w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: col.color || '#a1a1aa' }"
                />
                <span class="text-base font-medium flex-1 text-dimmed">{{ col.name }}</span>
                <UButton
                  icon="i-lucide-plus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="emit('link', col.id)"
                />
              </div>
            </template>

            <!-- List mode: available fields -->
            <template v-if="mode === 'list' && availableFields.length">
              <UiSectionLabel
                icon="i-lucide-plus-circle"
                label="Available fields"
                class="mt-3 pt-3 mb-1 border-t border-muted"
              />
              <div
                v-for="f in availableFields"
                :key="f.field"
                class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors group"
              >
                <UIcon
                  :name="f.icon"
                  class="text-base text-dimmed shrink-0"
                />
                <span class="text-base font-medium flex-1 text-dimmed">{{ f.label }}</span>
                <UButton
                  icon="i-lucide-plus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="emit('add', f.field)"
                />
              </div>
            </template>
          </template>

          <template #filters>
            <div class="flex flex-col gap-2.5">
              <!-- Status — a short fixed list, so toggles beat a picker -->
              <div
                v-if="statuses?.length"
                class="flex items-start gap-2"
              >
                <span class="text-xs font-medium text-dimmed pt-[5px] w-16 shrink-0 text-right">Status</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="s in statuses"
                    :key="s.id"
                    type="button"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition duration-150 active:scale-95"
                    :class="localStatusFilters.includes(s.id)
                      ? 'swatch'
                      : 'bg-elevated text-dimmed hover:text-toned'"
                    :style="localStatusFilters.includes(s.id) ? { '--swatch': s.color || undefined } : {}"
                    @click="toggleStatusFilter(s.id)"
                  >
                    <UIcon
                      :name="localStatusFilters.includes(s.id) ? 'i-lucide-check' : 'i-lucide-circle'"
                      class="text-2xs"
                      :class="localStatusFilters.includes(s.id) ? '' : 'swatch-text'"
                      :style="localStatusFilters.includes(s.id) ? {} : { '--swatch': s.color || undefined }"
                    />
                    {{ s.name }}
                  </button>
                </div>
              </div>

              <!-- Priority — four values, likewise -->
              <div class="flex items-start gap-2">
                <span class="text-xs font-medium text-dimmed pt-[5px] w-16 shrink-0 text-right">Priority</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="p in ['urgent', 'high', 'medium', 'low']"
                    :key="p"
                    type="button"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-colors"
                    :class="localPriorityFilters.includes(p)
                      ? [priorityTextClass(p), 'bg-elevated shadow-[inset_0_0_0_1.5px_currentColor]']
                      : 'bg-elevated text-dimmed hover:text-toned'"
                    @click="togglePriorityFilter(p)"
                  >
                    <!-- Icon inherits currentColor, so the priority hue comes from
                         the button's own text class rather than a second source. -->
                    <UIcon
                      :name="localPriorityFilters.includes(p) ? 'i-lucide-check' : priorityIcon(p)"
                      class="text-2xs"
                    />
                    {{ priorityLabel(p) }}
                  </button>
                </div>
              </div>

              <!-- Assignee and Tags grow without limit, so both are searchable -->
              <div
                v-if="members?.length"
                class="flex items-start gap-2"
              >
                <span class="text-xs font-medium text-dimmed pt-[7px] w-16 shrink-0 text-right">Assignee</span>
                <USelectMenu
                  v-model="localAssigneeFilters"
                  :items="memberItems"
                  multiple
                  value-key="value"
                  placeholder="Any member"
                  size="sm"
                  class="flex-1"
                />
              </div>

              <div
                v-if="tags?.length"
                class="flex items-start gap-2"
              >
                <span class="text-xs font-medium text-dimmed pt-[7px] w-16 shrink-0 text-right">Tags</span>
                <USelectMenu
                  v-model="localTagFilters"
                  :items="tagItems"
                  multiple
                  value-key="value"
                  placeholder="Any tag"
                  size="sm"
                  class="flex-1"
                >
                  <template #item-leading="{ item }">
                    <UiStatusDot
                      :color="item.color"
                      size="sm"
                    />
                  </template>
                </USelectMenu>
              </div>
            </div>
          </template>

          <template #display>
            <div class="flex flex-col gap-2.5">
              <UiSectionLabel
                icon="i-lucide-square-menu"
                label="Card shows"
              />
              <!--
                A grid of labels rather than eight switches each with a sentence
                under it: this is a picker for what a card displays, the board's
                version of a list's Fields dialog, and at that length prose per
                row is what turns a decision into a control panel. The one thing
                worth saying applies to all eight, so it is said once below.

                Two columns, filled row-major from `CARD_FIELDS`, so the order in
                that file is the order on screen.
              -->
              <div class="grid grid-cols-2 gap-x-6 gap-y-2.5 ms-3">
                <USwitch
                  v-for="field in CARD_FIELDS"
                  :key="field.key"
                  :model-value="fieldShown(field.key)"
                  :label="field.label"
                  @update:model-value="setFieldShown(field.key, $event)"
                />
              </div>
              <p class="text-xs text-muted ms-3">
                Hiding a field only stops the card painting it. Every field is
                still there to set when you hover the card.
              </p>
            </div>
          </template>
        </UTabs>
      </div>
    </template>

    <template #footer>
      <!-- Delete confirmation replaces footer -->
      <div
        v-if="showDeleteConfirm"
        class="w-full px-5 pt-4 pb-5 border-t border-error/30 bg-error/5"
      >
        <p class="text-sm font-medium text-error mb-2">
          This will permanently delete this {{ viewType || 'view' }}. Type <span class="font-bold">{{ viewName }}</span> to confirm.
        </p>
        <div class="flex items-center gap-2">
          <input
            v-model="deleteConfirmName"
            type="text"
            :placeholder="viewName"
            aria-label="Type the view name to confirm deletion"
            class="flex-1 min-w-0 text-base text-highlighted placeholder:text-dimmed bg-default border border-error/40 rounded-lg px-2.5 py-1.5 focus:border-error transition-colors"
          >
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            label="Delete"
            :loading="props.deletingView"
            :disabled="!deleteConfirmValid || props.deletingView"
            @click="handleDeleteView"
          />
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="showDeleteConfirm = false; deleteConfirmName = ''"
          />
        </div>
      </div>

      <!-- Close warning replaces footer -->
      <div
        v-else-if="showCloseWarning"
        class="w-full flex items-center justify-between px-5 pt-4 pb-5 border-t border-warning/30 bg-warning/5"
      >
        <p class="text-sm font-medium text-warning">
          Discard unsaved changes?
        </p>
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Keep editing"
            @click="showCloseWarning = false"
          />
          <UButton
            color="warning"
            variant="ghost"
            label="Discard"
            @click="discardAndClose"
          />
        </div>
      </div>

      <!-- Normal footer -->
      <div
        v-else
        class="w-full px-5 pt-4 pb-5 border-t border-muted"
      >
        <UiSaveBar
          :destructive-label="viewName !== undefined ? 'Delete' : undefined"
          cancel-label="Close"
          :disabled="!isDirty"
          :shortcut="false"
          @destructive="showDeleteConfirm = true; deleteConfirmName = ''"
          @cancel="close"
          @submit="save"
        />
      </div>
    </template>
  </UModal>
</template>
