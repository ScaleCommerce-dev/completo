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
  /** Whether the card panel is showing, so the board can put itself back when it isn't. */
  cardPanelOpen?: boolean
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
const { scroller, fadeStyle, updateFade } = useScrollFade(() => _props.columns.length)

// ─── Get out of the panel's way ─────────────────────────────────────────────
/**
 * Opening a card brings its column to the gutter the first column occupies on a
 * fresh board, and hands the panel everything to its right. See
 * `app/utils/card-panel.ts` for why that rather than a minimal nudge.
 *
 * The panel's width is published as a custom property because Tailwind needs
 * `max-w-[…]` as a literal at build time; `CardModal` reads it with a fallback,
 * so surfaces without a board — a list, My Tasks — keep the default width.
 */
const revealSpacerWidth = ref(0)
let scrollBeforeReveal: number | null = null

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * A node's distance from the scroller's content origin.
 *
 * Not `offsetLeft`: the scroller isn't positioned, so `offsetParent` is some
 * ancestor further up and `offsetLeft` carries that ancestor's inset too — 24px
 * of it here. The scroll arithmetic stayed self-consistent because both operands
 * shared the error, but the *width* calculation didn't, and the panel opened
 * with a 40px gap where 16 was specified. Measuring against the scroller's own
 * rect, with the current scroll added back, is the basis both actually want.
 */
function contentOffset(el: HTMLElement, node: HTMLElement): number {
  return node.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft
}

function revealColumn(columnId: string) {
  const el = scroller.value
  const column = el?.querySelector<HTMLElement>(`[data-column-id="${CSS.escape(columnId)}"]`)
  const first = el?.querySelector<HTMLElement>('[data-column-id]')
  if (!el || !column || !first) return

  const gutter = contentOffset(el, first)
  const columnStart = contentOffset(el, column)
  const width = cardPanelWidth({
    viewportWidth: window.innerWidth,
    boardLeft: el.getBoundingClientRect().left,
    gutter,
    columnWidth: column.offsetWidth
  })
  // Too narrow for the layout: leave the board where it is and let the panel
  // open at its default width over the top, as it always did.
  if (width === null) return

  document.documentElement.style.setProperty('--card-panel-w', `${width}px`)

  // Only the first reveal of a panel session records where the board was.
  // ←/→ walks to the next column without closing the panel, and each crossing
  // calls this again — capturing then would save a *revealed* offset, and one
  // sampled mid-smooth-scroll at that, so Escape restored the board to wherever
  // the animation happened to be. `restoreScroll` nulls this, which is what
  // makes the next open capture again.
  if (scrollBeforeReveal === null) scrollBeforeReveal = el.scrollLeft
  revealSpacerWidth.value = revealSpacer({
    columnOffset: columnStart,
    gutter,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth
  })

  // After the spacer is in the DOM, or the scroll clamps to the old maximum and
  // the last columns stop short of the gutter.
  nextTick(() => {
    el.scrollTo({
      left: revealScrollLeft(columnStart, gutter),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    })
  })
}

/**
 * Put the board back exactly where it was.
 *
 * Instantly, and that is deliberate: the restore runs behind a panel that is
 * still sliding out, so a smooth scroll would be both invisible and a problem —
 * dropping the spacer mid-flight clamps `scrollLeft` and the board would jump.
 * The saved position was reachable without the spacer by definition, so setting
 * it and removing the spacer in the same tick is always safe.
 *
 * Unconditional, because the board cannot have moved: while the panel is open
 * Reka makes the rest of the page inert (`body { pointer-events: none }`), so
 * there is no scrolling it behind the panel's back.
 */
function restoreScroll() {
  document.documentElement.style.removeProperty('--card-panel-w')
  const el = scroller.value
  const to = scrollBeforeReveal
  scrollBeforeReveal = null
  revealSpacerWidth.value = 0
  if (el && to !== null) el.scrollTo({ left: to, behavior: 'auto' })
}

watch(() => _props.cardPanelOpen, (open) => {
  if (!open) restoreScroll()
})

onBeforeUnmount(() => document.documentElement.style.removeProperty('--card-panel-w'))

/**
 * Arrow-key navigation is driven by the page — it owns the card data and the
 * filters — but the scroller lives here, so revealing a column is ours to do.
 */
defineExpose({ revealColumn })

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
        class="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-default py-10 text-sm font-medium text-dimmed hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
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
        class="rounded-xl border border-default bg-default p-3 flex flex-col gap-2 shadow-raise"
      >
        <!-- Pick from available columns -->
        <template v-if="mode === 'pick'">
          <div
            v-if="availableColumns?.length"
            class="flex flex-col gap-1"
          >
            <span class="text-xs font-bold text-muted uppercase tracking-label mb-0.5">Available columns</span>
            <button
              v-for="col in availableColumns"
              :key="col.id"
              type="button"
              class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-base font-medium text-default hover:bg-elevated transition-colors text-left"
              @click="linkExisting(col.id)"
            >
              <UiStatusDot :color="col.color" />
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
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
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
              aria-label="Column name"
              type="text"
              placeholder="Column name"
              class="w-full text-base font-medium text-highlighted placeholder:text-dimmed bg-transparent border border-accented rounded-lg px-2.5 py-1.5 transition-colors"
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

    <!-- Scroll room so a column near the end of the board can still reach the
         left gutter — a board only scrolls until its last column hits the right
         edge, which is exactly the columns the panel covers worst. Sized to the
         shortfall alone, so it stays under the panel and is never seen. -->
    <div
      v-if="revealSpacerWidth"
      aria-hidden="true"
      class="shrink-0"
      :style="{ width: `${revealSpacerWidth}px` }"
    />
  </div>
</template>
