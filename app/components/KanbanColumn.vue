<script setup lang="ts">
import type { BoardCard, CardStatus } from '~/types/card'

/**
 * One column on the board.
 *
 * Changes worth knowing about:
 *  - The column now reads as a tray. Its fill was a 50-shade neutral at 80%
 *    opacity on white, which is almost invisible, so cards appeared to float on
 *    the page rather than sit in a container.
 *  - The header carries one control, `+`. It briefly also had a `…` menu, whose
 *    two entries were "Add a card" (the same thing as `+`, one click further
 *    away) and "Column settings", which opened the *board's* settings dialog —
 *    already one click away in the view header, and not per-column at all
 *    despite where it was hung. A menu that only restates its neighbours is
 *    noise on a control that repeats once per column.
 *  - The two add paths do different things, and where they sit is the reason.
 *    Quick add is the one-line composer, and it lives on the tray floor at the
 *    end of the stack — the place a card actually lands, and the place you are
 *    already looking when you want another one. It stays open so a backlog can
 *    be typed in one go. The header `+` is column chrome, so it opens the full
 *    dialog with this column prefilled: the same "New card" the view header
 *    offers, scoped to one column, under the same name.
 *
 *    Both used to open the composer, which meant clicking at the top of a tall
 *    column put the caret at the bottom of it, and the full form was reachable
 *    from the board only via the toolbar (where it always picked column one).
 *  - The header no longer sets its name in uppercase with letterspacing; at 13px
 *    that is measurably harder to scan than sentence case.
 *  - The entrance animation ran with `animation-delay: ${0}ms` — a literal zero,
 *    so the staggered reveal that was written and shipped did nothing.
 */
const draggable = defineAsyncComponent(() => import('vuedraggable'))

const props = defineProps<{
  column: CardStatus
  cards: BoardCard[]
  accentColor?: string
  isDone?: boolean
  /** Stagger index for the first-mount reveal. */
  index?: number
}>()

const emit = defineEmits<{
  'card-click': [card: BoardCard]
  'card-change': [evt: Record<string, unknown>]
  'card-update': [cardId: number, updates: Record<string, unknown>]
  'card-update-tags': [cardId: number, tagIds: string[]]
  'add-card': []
  'quick-add': [title: string]
}>()

// Use vuedraggable's :list mode (mutates this array directly) instead of
// :model-value — the latter re-inserts the dropped node into the source DOM
// before @change fires, causing a visible flicker on inter-column moves.
// Resync only when the id sequence actually differs, so an in-flight
// optimistic mutation isn't clobbered by stale props.
const localCards = ref<BoardCard[]>([...props.cards])
watch(() => props.cards, (val) => {
  if (val.length !== localCards.value.length
    || val.some((c, i) => c.id !== localCards.value[i]?.id)) {
    localCards.value = [...val]
  }
})

// ─── Drop target ────────────────────────────────────────────────────────────
// `.column-drop-active` was defined in main.css and never applied by anything,
// so dragging a card gave no indication of where it would land.
const dragOver = ref(false)

function onDragEnter() {
  dragOver.value = true
}
function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  if (related && (e.currentTarget as HTMLElement).contains(related)) return
  dragOver.value = false
}
function onDrop() {
  dragOver.value = false
}

// ─── Inline composer ────────────────────────────────────────────────────────
const composing = ref(false)
const draft = ref('')
const draftInput = ref<HTMLTextAreaElement>()

function startComposing() {
  composing.value = true
  nextTick(() => draftInput.value?.focus())
}

function commitDraft(keepOpen = true) {
  const title = draft.value.trim()
  if (!title) {
    composing.value = false
    return
  }
  emit('quick-add', title)
  draft.value = ''
  if (keepOpen) {
    nextTick(() => draftInput.value?.focus())
  } else {
    composing.value = false
  }
}

function cancelComposing() {
  draft.value = ''
  composing.value = false
}

const countLabel = computed(() =>
  `${props.cards.length} ${props.cards.length === 1 ? 'card' : 'cards'}`
)
</script>

<template>
  <section
    class="rise-in flex flex-col w-column shrink-0 max-h-full rounded-xl bg-muted border border-default transition-colors"
    :class="dragOver ? 'column-drop-active' : ''"
    :style="{ animationDelay: staggerDelay((index ?? 0) * 45) }"
    :aria-label="`${column.name}, ${countLabel}`"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Header -->
    <header class="flex items-center gap-2 px-3 py-2.5 shrink-0">
      <UiStatusDot
        :color="accentColor"
        :done="isDone"
      />
      <h3
        class="font-bold text-sm tracking-name truncate"
        :class="isDone ? 'text-success' : 'text-toned'"
      >
        {{ column.name }}
      </h3>
      <span class="text-xs font-mono tabular-nums text-dimmed shrink-0">{{ cards.length }}</span>

      <!-- Icon-only, so it says out loud what it is. Without the tooltip the two
           add paths were indistinguishable until you clicked one. -->
      <UTooltip text="New card">
        <UButton
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          class="ml-auto shrink-0"
          :aria-label="`New card in ${column.name}`"
          @click="emit('add-card')"
        />
      </UTooltip>
    </header>

    <!-- Cards -->
    <div class="flex-1 overflow-y-auto thin-scroll px-2 min-h-0">
      <ClientOnly>
        <draggable
          :list="localCards"
          group="cards"
          item-key="id"
          class="flex flex-col gap-1.5 min-h-[4rem]"
          ghost-class="sortable-ghost"
          chosen-class="sortable-chosen"
          drag-class="sortable-drag"
          :scroll-sensitivity="120"
          :force-fallback="false"
          @change="(evt: Record<string, unknown>) => emit('card-change', evt)"
        >
          <template #item="{ element: card }">
            <KanbanCard
              :card="card"
              @click="emit('card-click', card)"
              @update="(cardId, updates) => emit('card-update', cardId, updates)"
              @update-tags="(cardId, tagIds) => emit('card-update-tags', cardId, tagIds)"
            />
          </template>
        </draggable>
      </ClientOnly>

      <!-- Empty columns get a real target. This was `min-h-[3rem]` — a 48px strip
           at the top of an otherwise blank column. -->
      <div
        v-if="!localCards.length && !composing"
        class="pointer-events-none flex items-center justify-center rounded-lg border border-dashed border-accented/70 py-8 mt-1 text-xs text-dimmed"
      >
        Drop a card here
      </div>
    </div>

    <!-- Composer / add button -->
    <div class="p-2 shrink-0">
      <div
        v-if="composing"
        class="rounded-lg border border-accented bg-default p-2 shadow-raise"
      >
        <textarea
          ref="draftInput"
          v-model="draft"
          rows="2"
          :aria-label="`Add a card to ${column.name}`"
          :placeholder="`Add to ${column.name}...`"
          class="w-full resize-none bg-transparent text-sm leading-snug text-highlighted placeholder:text-dimmed border-0 p-0 focus:outline-none"
          @keydown.enter.exact.prevent="commitDraft(true)"
          @keydown.esc.stop.prevent="cancelComposing"
          @blur="commitDraft(false)"
        />
        <div class="flex items-center gap-1.5 mt-1.5">
          <UButton
            label="Add"
            size="xs"
            :disabled="!draft.trim()"
            @mousedown.prevent
            @click="commitDraft(true)"
          />
          <UButton
            label="Cancel"
            variant="ghost"
            color="neutral"
            size="xs"
            @mousedown.prevent
            @click="cancelComposing"
          />
          <span class="ml-auto text-2xs text-dimmed">
            <UiKey
              value="enter"
            /> to add
          </span>
        </div>
      </div>

      <UButton
        v-else
        label="Quick add"
        icon="i-lucide-plus"
        variant="ghost"
        color="neutral"
        block
        class="justify-start text-dimmed"
        @click="startComposing"
      />
    </div>
  </section>
</template>
