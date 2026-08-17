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
  /**
   * Which of the three views this is configuring.
   *
   * Replaces a `mode` / `viewType` pair plus two load-bearing *absences*: My Tasks
   * used to identify itself by passing no `viewName` (dropping rename and delete)
   * and no `active*Filters` (dropping the Filters tab), and the old comments called
   * those omissions load-bearing — which is the tell that the third case wanted a
   * name. A named member cannot be arrived at by forgetting a prop.
   */
  kind: 'board' | 'list' | 'my-tasks'
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

/**
 * What each view can be told to do, derived from `kind` in one place.
 *
 * A board arranges statuses into columns and can hide fields on its cards; a list
 * arranges which card fields its table shows. My Tasks arranges the same table
 * columns but is one-per-user and always exists, so it has no name to change, no
 * row to delete, and — the reason it never had filters — nowhere to persist one:
 * a filter here would belong to the viewer, not to a shared view.
 */
const isBoard = computed(() => props.kind === 'board')
const isView = computed(() => props.kind !== 'my-tasks')

const KIND = computed(() => ({
  'board': { noun: 'board', title: 'Board settings', icon: 'i-lucide-layout-dashboard' },
  'list': { noun: 'list', title: 'List settings', icon: 'i-lucide-list' },
  'my-tasks': { noun: 'view', title: 'My Tasks settings', icon: 'i-lucide-circle-check' }
}[props.kind]))

/**
 * What the dialog says it is for, under the title.
 *
 * The board's and the list's settings are shared — they are columns on the view's
 * own row, so changing a filter changes the board for everyone who opens it. My
 * Tasks' are the viewer's. That difference is worth stating, because nothing else
 * on screen distinguishes a setting that only affects you from one that does not.
 */
const KIND_DESCRIPTION = computed(() => isView.value
  ? `Everyone who opens this ${KIND.value.noun} sees these settings`
  : 'Only you see these settings')

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
 * Filtering is a capability of the view, and My Tasks is the one without it: its
 * settings are per-user, and a filter here would have nowhere shared to live.
 *
 * This used to be keyed on whether any `active*Filters` prop was passed, which
 * worked but meant the tab appeared or vanished according to what a host
 * remembered to bind. It is `kind` now, like everything else.
 */
const filterable = computed(() => isView.value)

/**
 * Local state, and *props are the snapshot*.
 *
 * There used to be a parallel `snapshot*` ref for every one of these, taken on
 * open, so that `isDirty` could light a Save button. Live-apply removes the Save
 * button and the snapshots with it — but not the comparison, which is still needed
 * to avoid writing a value the server already has. It compares against `props`
 * instead, which is the server's own answer flowing back. One copy fewer, and the
 * copy that is gone is the one that could drift: a colour change refreshed
 * `props.columns` mid-session and used to wipe a pending reorder along with its
 * snapshot, leaving Save disabled with nothing to say why.
 */
const localColumns = ref<ColumnItem[]>([])
const localTagFilters = ref<string[]>([])
const localStatusFilters = ref<string[]>([])
const localAssigneeFilters = ref<string[]>([])
const localPriorityFilters = ref<string[]>([])
const localHiddenFields = ref<string[]>([])
const editName = ref('')

/** Order-insensitive: a set toggled off and on again is not a change to write. */
const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')

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

function resetToProps() {
  localColumns.value = [...props.columns]
  localTagFilters.value = [...(props.activeTagFilters || [])]
  localStatusFilters.value = [...(props.activeStatusFilters || [])]
  localAssigneeFilters.value = [...(props.activeAssigneeFilters || [])]
  localPriorityFilters.value = [...(props.activePriorityFilters || [])]
  localHiddenFields.value = [...(props.hiddenCardFields || [])]
  editName.value = props.viewName || ''
}

/**
 * Filters and display write themselves, on a short delay.
 *
 * Live-apply, because these are the view's own configuration and there is no Save
 * to stage them behind any more. Delayed, because `updateFilters` PUTs *and*
 * refetches the whole view (`useViewData`), so a run of eight tag chips would be
 * eight round trips and eight refetches of every card — the exact cost CLAUDE.md
 * records for card edits. 400ms turns a burst of toggles into one write while
 * still feeling immediate, since the chips paint from local state.
 *
 * Flushed when the dialog closes, or a toggle made inside the last 400ms would be
 * shown as applied and never sent.
 */
const FILTER_WRITE_DELAY = 400
let writeTimer: ReturnType<typeof setTimeout> | null = null

function changedFilters() {
  const payload: { tagFilters?: string[], statusFilters?: string[], assigneeFilters?: string[], priorityFilters?: string[] } = {}
  if (!sameSet(localTagFilters.value, props.activeTagFilters)) payload.tagFilters = [...localTagFilters.value]
  if (!sameSet(localStatusFilters.value, props.activeStatusFilters)) payload.statusFilters = [...localStatusFilters.value]
  if (!sameSet(localAssigneeFilters.value, props.activeAssigneeFilters)) payload.assigneeFilters = [...localAssigneeFilters.value]
  if (!sameSet(localPriorityFilters.value, props.activePriorityFilters)) payload.priorityFilters = [...localPriorityFilters.value]

  return payload
}

function flushWrites() {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = null

  const filters = changedFilters()
  if (Object.keys(filters).length) emit('update-filters', filters)

  if (isBoard.value && !sameSet(localHiddenFields.value, props.hiddenCardFields)) {
    emit('update-display', { hiddenCardFields: [...localHiddenFields.value] })
  }
}

function scheduleWrite() {
  if (!open.value) return
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flushWrites, FILTER_WRITE_DELAY)
}

// One watcher for every filter control: the status and priority chips go through
// their own toggles, tags and assignees are `v-model` on a USelectMenu. Watching
// the state rather than wiring each control is what keeps those in step.
watch(
  [localTagFilters, localStatusFilters, localAssigneeFilters, localPriorityFilters, localHiddenFields],
  scheduleWrite
)

onUnmounted(() => {
  if (writeTimer) clearTimeout(writeTimer)
})

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
    label: isBoard.value ? 'Columns' : 'Fields',
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
  ...(isBoard.value
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
    // Always open on Columns rather than wherever you were last time.
    configTab.value = 'columns'
  } else {
    // Nothing is staged any more, but a toggle inside the last delay still is.
    flushWrites()
  }
})

/**
 * Re-sync when the columns change underneath us.
 *
 * Everything on this tab now writes on the action — add, delete, link, colour and
 * order alike — so this fires after each of them, and the local list must survive
 * its own round trip. The incoming set wins on *membership* and the local list
 * keeps its *order*: ids the user has arranged stay arranged, ids that appeared are
 * appended, ids that went away are dropped.
 *
 * That mattered more when order was staged: this used to overwrite `localColumns`
 * and its snapshot together, so recolouring a column after reordering three threw
 * the reorder away and disabled Save with nothing to say why. Order is written on
 * drop now, but keeping the arrangement is still what stops a refresh mid-drag
 * from shuffling the list under the pointer.
 */
watch(() => props.columns, (cols) => {
  if (!open.value) return
  const incoming = cols.map(c => c.id)
  const arranged = localColumns.value.map(c => c.id).filter(id => incoming.includes(id))
  const appended = incoming.filter(id => !arranged.includes(id))

  localColumns.value = [...arranged, ...appended]
    .map(id => cols.find(c => c.id === id))
    .filter((c): c is ColumnItem => !!c)
}, { immediate: true })

/**
 * The one action here that cannot be undone by repeating it, and the asterisk on
 * "view config is non-destructive": unlinking a column re-links from the list
 * below, but nothing recorded the order five columns were in before the drag.
 * Written on drop because a drag is already a deliberate, completed gesture —
 * every kanban commits one this way and none of them offers an undo.
 */
function onDragEnd() {
  const order = localColumns.value.map(c => c.id)
  if (order.join(',') === props.columns.map(c => c.id).join(',')) return
  emit('reorder', localColumns.value.map((c, i) => ({ id: c.id, position: i })))
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

/**
 * The name commits from its own button, like the add-column row two rows below it.
 *
 * A text field cannot live-apply per keystroke, so the two honest options are commit
 * on blur — which the card panel's title uses — or a button. A button here, because
 * this field sits in a column of rows that all end in one, and matching the row you
 * can see beats matching a field on another surface. Enter submits, which is what
 * the form element is for.
 *
 * A rename to nothing is not a rename: the field goes back to the name the view
 * actually has, so the dialog never sits showing one it does not.
 */
const nameChanged = computed(() => {
  const trimmed = editName.value.trim()
  return !!trimmed && trimmed !== (props.viewName || '')
})

function commitName() {
  if (!nameChanged.value) {
    editName.value = props.viewName || ''
    return
  }
  emit('rename', editName.value.trim())
}

/**
 * Deleting the view is the one thing here that is not live, and the only thing left
 * in the footer. Inline rather than a dialog because this *is* a dialog — see
 * `ui/InlineConfirm`, which owns the typed name and the validation.
 */
const showDeleteConfirm = ref(false)
</script>

<template>
  <!--
    A real header at last. This carried `header: 'hidden'` with no `:title`, which
    made it the one dialog in the app with no accessible name — the view it
    configures was announced as nothing at all. The title comes from `kind`, so it
    cannot disagree with the tabs below it.
  -->
  <UiModal
    v-model:open="open"
    :icon="KIND.icon"
    :title="KIND.title"
    :description="KIND_DESCRIPTION"
    :ui="{ body: 'pt-0 sm:pt-0', footer: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div class="flex flex-col gap-1">
        <!-- Name, committed by its own button — see `commitName`. -->
        <form
          v-if="isView"
          class="flex items-center gap-2 pt-5 pb-1"
          @submit.prevent="commitName"
        >
          <UInput
            v-model="editName"
            :placeholder="`${KIND.noun} name...`"
            :aria-label="`${KIND.noun} name`"
            size="sm"
            class="flex-1"
          />
          <UButton
            type="submit"
            icon="i-lucide-check"
            label="Rename"
            size="sm"
            :disabled="!nameChanged"
          />
        </form>

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
          :class="isView ? 'pt-2' : 'pt-5'"
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
                    <template v-if="isBoard">
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
                      v-if="!isBoard"
                      :name="fieldIcon(col.field || '')"
                      class="text-base text-dimmed shrink-0"
                    />
                    <span class="text-base font-medium flex-1">
                      {{ isBoard ? col.name : fieldLabel(col.field || '') }}
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
              v-if="isBoard && canAddColumns"
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
            <template v-if="isBoard && availableColumns?.length">
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
            <template v-if="!isBoard && availableFields.length">
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

    <!--
      No Save, no Cancel. Every setting above writes itself — columns and filters on
      the action, the name from its own button — so the footer holds the one thing
      that is still a transaction, and Close is the dialog's own ✕. That is the same
      conclusion the card panel reached: edit mode has no footer because a pinned
      action bar would hold nothing but Delete.

      A footer that offered Save also had to offer "discard unsaved changes", and
      that warning was lying: column adds, deletes and colour changes had already
      committed, so Discard threw away the rename and kept the three columns you had
      just removed.
    -->
    <template
      v-if="isView"
      #footer
    >
      <div class="w-full px-5 pt-4 pb-5 border-t border-muted">
        <UiInlineConfirm
          v-if="showDeleteConfirm"
          :label="`this ${KIND.noun}`"
          :confirm-text="viewName"
          :message="`This will permanently delete the ${KIND.noun}. Every card and status stays on the project.`"
          :loading="deletingView"
          @confirm="emit('delete-view')"
          @cancel="showDeleteConfirm = false"
        />
        <!-- Not `UiSaveBar`: that row always renders a submit, and the whole point
             of this change is that there is nothing left to submit. What it keeps
             is the bar's vocabulary for a destructive action — ghost, error,
             `trash-2`, pinned to the row's left. -->
        <UButton
          v-else
          icon="i-lucide-trash-2"
          :label="`Delete ${KIND.noun}`"
          color="error"
          variant="ghost"
          @click="showDeleteConfirm = true"
        />
      </div>
    </template>
  </UiModal>
</template>
