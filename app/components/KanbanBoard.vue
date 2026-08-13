<script setup lang="ts">
import type { BoardCard, CardStatus, Member } from '~/types/card'
// `shared/utils` is auto-imported for Nitro but not for app components.
import { cardFieldVisible, type CardField } from '#shared/utils/card-fields'

const _props = defineProps<{
  columns: CardStatus[]
  cardsByColumn: Record<string, BoardCard[]>
  projectKey?: string
  projectSlug?: string
  doneStatusId?: string | null
  hiddenCardFields?: string[]
  canConfigureColumns?: boolean
  canAddColumns?: boolean
  availableColumns?: CardStatus[]
  members?: Member[]
  tags?: Array<{ id: string, name: string, color: string }>
}>()

const kanbanContext = {
  projectKey: computed(() => _props.projectKey),
  projectSlug: computed(() => _props.projectSlug),
  members: computed(() => _props.members),
  tags: computed(() => _props.tags),
  // Through the context rather than as a prop: KanbanColumn has no use for it
  // and would only be forwarding it to KanbanCard.
  cardFieldVisible: computed(() => (key: CardField) => cardFieldVisible(_props.hiddenCardFields, key))
}
provide('kanbanContext', kanbanContext)

const emit = defineEmits<{
  'card-click': [card: BoardCard]
  'card-moved': [cardId: number, toColumnId: string, toPosition: number]
  'card-update': [cardId: number, updates: Record<string, unknown>]
  'card-update-tags': [cardId: number, tagIds: string[]]
  'add-card': [columnId: string]
  'quick-add': [columnId: string, title: string]
  'add-column': [name: string, color?: string]
  'link-column': [columnId: string]
}>()

function handleCardChange(columnId: string, evt: { added?: { element: { id: number }, newIndex: number }, moved?: { element: { id: number }, newIndex: number } }) {
  if (evt.added) {
    emit('card-moved', evt.added.element.id, columnId, evt.added.newIndex)
  } else if (evt.moved) {
    emit('card-moved', evt.moved.element.id, columnId, evt.moved.newIndex)
  }
}

const showAddColumn = ref(false)
const mode = ref<'pick' | 'create'>('pick')
const newColumnName = ref('')
const newColumnColor = ref('#6366f1')
const newColorOpen = ref(false)
const nameInput = ref<HTMLInputElement>()

function openAddColumn() {
  showAddColumn.value = true
  mode.value = 'pick'
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

function switchToCreate() {
  mode.value = 'create'
  nextTick(() => nameInput.value?.focus())
}

function linkExisting(columnId: string) {
  emit('link-column', columnId)
  showAddColumn.value = false
}

function submitColumn() {
  if (!newColumnName.value.trim()) return
  emit('add-column', newColumnName.value.trim(), newColumnColor.value)
  showAddColumn.value = false
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

function cancelAddColumn() {
  showAddColumn.value = false
  newColumnName.value = ''
  newColumnColor.value = '#6366f1'
}

// ─── Horizontal scroll affordance ───────────────────────────────────────────
// The board ended in a hard cut: at 1512px the fifth column was sliced through
// mid-word with nothing to suggest more existed. The mask fades only the edges
// that actually have content beyond them, so a board that fits shows no fade.
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

watch(() => _props.columns.length, () => nextTick(updateFade))

// ─── Get out of the panel's way ─────────────────────────────────────────────
/**
 * Opening a card slides a panel over the right of the viewport, and the column
 * you clicked in is the one most likely to end up underneath it — you scroll to
 * the column you are working in, which puts it on the right. So the board scrolls
 * just far enough to bring that column clear before the panel arrives.
 *
 * The arithmetic is in `scrollToClearPanel`, which decides when the move would
 * make things worse and declines. See that file for why the panel stays on the
 * right.
 */
function revealColumn(columnId: string) {
  const el = scroller.value
  const column = el?.querySelector<HTMLElement>(`[data-column-id="${CSS.escape(columnId)}"]`)
  if (!el || !column) return

  const left = scrollToClearPanel({
    column: column.getBoundingClientRect(),
    board: el.getBoundingClientRect(),
    viewportWidth: window.innerWidth
  })
  if (!left) return

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollBy({ left, behavior: reduced ? 'auto' : 'smooth' })
}

/**
 * The column id comes from the template rather than the card: `BoardCard` has no
 * `statusId`, deliberately — on a board the column already says what the status
 * is, so carrying it on every card would be a second copy to keep in step.
 */
function onCardClick(columnId: string, card: BoardCard) {
  revealColumn(columnId)
  emit('card-click', card)
}
</script>

<template>
  <div
    ref="scroller"
    class="flex gap-3 overflow-x-auto overflow-y-hidden px-4 py-4 flex-1 min-h-0 thin-scroll board-scroll"
    :style="fadeStyle"
    @scroll.passive="updateFade"
  >
    <KanbanColumn
      v-for="(column, i) in columns"
      :key="column.id"
      :data-column-id="column.id"
      :column="column"
      :cards="cardsByColumn[column.id] || []"
      :accent-color="column.color || undefined"
      :is-done="column.id === doneStatusId"
      :index="i"
      @card-click="(card) => onCardClick(column.id, card)"
      @card-change="(evt) => handleCardChange(column.id, evt)"
      @card-update="(cardId, updates) => emit('card-update', cardId, updates)"
      @card-update-tags="(cardId, tagIds) => emit('card-update-tags', cardId, tagIds)"
      @add-card="emit('add-card', column.id)"
      @quick-add="(title) => emit('quick-add', column.id, title)"
    />

    <!-- Add column -->
    <div
      v-if="canConfigureColumns"
      class="shrink-0 w-column"
    >
      <button
        v-if="!showAddColumn"
        class="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default py-10 text-sm font-medium text-dimmed hover:border-primary hover:text-primary hover:border-primary/50 hover:bg-primary/5 hover:bg-primary/10 transition-colors"
        @click="openAddColumn"
      >
        <UIcon
          name="i-lucide-plus"
          class="text-base"
        />
        Add column
      </button>

      <!-- Pick / Create panel -->
      <div
        v-else
        class="rounded-xl border border-default bg-default p-3 flex flex-col gap-2 shadow-sm"
      >
        <!-- Pick from available columns -->
        <template v-if="mode === 'pick'">
          <div
            v-if="availableColumns?.length"
            class="flex flex-col gap-1"
          >
            <span class="text-xs font-bold text-muted uppercase tracking-[0.06em] mb-0.5">Available columns</span>
            <button
              v-for="col in availableColumns"
              :key="col.id"
              type="button"
              class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-base font-medium text-default hover:bg-elevated transition-colors text-left"
              @click="linkExisting(col.id)"
            >
              <div
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: col.color || '#a1a1aa' }"
              />
              {{ col.name }}
            </button>
          </div>
          <div
            v-else
            class="text-sm text-dimmed py-2 text-center"
          >
            No unlinked columns available
          </div>

          <template v-if="canAddColumns">
            <div
              v-if="availableColumns?.length"
              class="border-t border-default my-0.5"
            />
            <button
              type="button"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 hover:bg-primary/20 transition-colors"
              @click="switchToCreate"
            >
              <UIcon
                name="i-lucide-plus"
                class="text-sm"
              />
              Create new column <span class="text-2xs text-dimmed font-normal">(project-wide)</span>
            </button>
          </template>

          <div class="flex justify-end pt-0.5">
            <button
              type="button"
              class="px-2 py-1 rounded-md text-xs font-medium text-dimmed hover:text-toned hover:bg-elevated transition-colors"
              @click="cancelAddColumn"
            >
              Cancel
            </button>
          </div>
        </template>

        <!-- Create new column form (project owner/admin only) -->
        <form
          v-else
          @submit.prevent="submitColumn"
        >
          <div class="flex flex-col gap-2.5">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-dimmed hover:text-toned transition-colors self-start"
              @click="mode = 'pick'"
            >
              <UIcon
                name="i-lucide-arrow-left"
                class="text-xs"
              />
              Back
            </button>
            <input
              ref="nameInput"
              v-model="newColumnName"
              type="text"
              placeholder="Column name"
              class="w-full text-base font-medium text-highlighted placeholder-zinc-400 dark:placeholder-zinc-500 bg-transparent border border-accented rounded-lg px-2.5 py-1.5 outline-none focus:border-primary transition-colors"
              @keydown.escape="cancelAddColumn"
            >
            <div class="flex items-center gap-2">
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
              <span class="text-xs text-dimmed">Color</span>
              <div class="flex-1" />
              <button
                type="button"
                class="px-2 py-1 rounded-md text-xs font-medium text-dimmed hover:text-toned hover:bg-elevated transition-colors"
                @click="cancelAddColumn"
              >
                Cancel
              </button>
              <UButton
                type="submit"
                label="Add"
                icon="i-lucide-plus"
                size="xs"
                :disabled="!newColumnName.trim()"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
