<script setup lang="ts">
const draggable = defineAsyncComponent(() => import('vuedraggable'))

interface KanbanColumnData {
  id: string
  name: string
  color?: string | null
}

interface KanbanCardData {
  id: number
  title: string
  description?: string | null
  priority: string
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  tags?: Array<{ id: string, name: string, color: string }>
  attachmentCount?: number
  dueDate?: string | null
}

const props = defineProps<{
  column: KanbanColumnData
  cards: KanbanCardData[]
  accentColor?: string
  isDone?: boolean
}>()

const emit = defineEmits<{
  'card-click': [card: KanbanCardData]
  'card-change': [evt: Record<string, unknown>]
  'card-update': [cardId: number, updates: Record<string, unknown>]
  'add-card': []
}>()

const localCards = computed({
  get: () => props.cards,
  set: () => {} // handled by change event
})

function onAreaDblClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.kanban-card')) return
  emit('add-card')
}
</script>

<template>
  <div
    class="kanban-col-enter flex flex-col w-[280px] shrink-0 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/30 max-h-full border border-zinc-200/50 dark:border-zinc-700/30"
    :style="{ 'animation-delay': `${0}ms` }"
  >
    <!-- Column header -->
    <div class="flex items-center justify-between px-3 py-3">
      <div
        class="flex items-center gap-2.5 px-1 py-0.5 rounded-md"
        :class="isDone ? 'bg-emerald-50 dark:bg-emerald-950/25 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40' : ''"
      >
        <!-- Done checkmark or colored dot -->
        <UIcon
          v-if="isDone"
          name="i-lucide-circle-check-big"
          class="text-[13px] text-emerald-500 dark:text-emerald-400 shrink-0"
        />
        <div
          v-else
          class="w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: accentColor || '#64748b' }"
        />
        <h3
          class="font-bold text-[13.5px] uppercase tracking-[0.04em]"
          :class="isDone ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-500 dark:text-zinc-400'"
        >
          {{ column.name }}
        </h3>
        <span
          class="text-[12px] tabular-nums font-mono font-medium"
          :class="isDone ? 'text-emerald-500/70 dark:text-emerald-400/70' : 'text-zinc-400 dark:text-zinc-500'"
        >
          {{ cards.length }}
        </span>
      </div>
      <button
        class="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40 transition-all"
        @click="emit('add-card')"
      >
        <UIcon
          name="i-lucide-plus"
          class="text-sm"
        />
      </button>
    </div>

    <!-- Cards area -->
    <div
      class="flex-1 overflow-y-auto px-2 pb-1.5 min-h-[3rem]"
      @dblclick="onAreaDblClick"
    >
      <ClientOnly>
        <draggable
          :model-value="localCards"
          group="cards"
          item-key="id"
          class="flex flex-col gap-1.5 min-h-full"
          ghost-class="sortable-ghost"
          chosen-class="sortable-chosen"
          drag-class="sortable-drag"
          @change="(evt: Record<string, unknown>) => emit('card-change', evt)"
        >
          <template #item="{ element: card, index }">
            <div
              class="kanban-card-enter"
              :style="{ 'animation-delay': `${index * 30}ms` }"
            >
              <KanbanCard
                :card="card"
                @click="emit('card-click', card)"
                @update="(cardId, updates) => emit('card-update', cardId, updates)"
              />
            </div>
          </template>
        </draggable>
      </ClientOnly>
    </div>

    <!-- Add card button -->
    <div class="px-2 pb-2">
      <button
        class="w-full flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40 transition-all"
        @click="emit('add-card')"
      >
        <UIcon
          name="i-lucide-plus"
          class="text-sm"
        />
        New card
      </button>
    </div>
  </div>
</template>
