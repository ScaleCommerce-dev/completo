<script setup lang="ts">
import type { CalendarMode } from '#shared/utils/calendar-filter'
import type { CalendarCard } from '~/types/calendar'
import { cardsByDay, type CalendarDay } from '~/utils/calendar-days'
import { descriptionSnippet } from '#shared/utils/card-search'

/**
 * The Calendar page's grid: seven columns, one week (tall days with room for a
 * post's project) or a whole month (weeks as rows, compact chips, the rest of
 * a full day behind "+N more").
 *
 * A card is a chip in the day it is due, with the board's priority edge bar
 * for high and urgent, done cards faded. A chip can be dragged to another
 * day, which sets that day as its due date; the page saves it.
 *
 * Wider than the screen, the grid scrolls sideways inside its own container,
 * never the page.
 */
const props = defineProps<{
  mode: CalendarMode
  days: CalendarDay[]
  today: string
  cards: CalendarCard[]
}>()

const emit = defineEmits<{
  'card-click': [card: CalendarCard]
  'move': [cardId: number, day: string]
  'open-day': [day: string]
}>()

/** How many chips a month cell shows before "+N more". */
const MONTH_CHIPS = 4
const WEEKDAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const byDay = computed(() => cardsByDay(props.cards))
const cardsOn = (day: CalendarDay) => byDay.value.get(day.key) ?? []

// ─── Hover preview ───────────────────────────────────────────────────────────

/**
 * The chip carries a title; the preview (`CardPreview`) answers the rest without
 * opening the panel: status by name, priority, who has it, the other tags (for
 * a content plan, the channel) and the start of the description, which for a
 * post is the post. A hover card, not a tooltip: Nuxt UI fixes a tooltip at one
 * line high, and the three lines this once put in one spilled over the
 * neighbouring days.
 *
 * - **Half a second before it opens,** so sweeping the pointer across a month
 *   does not flash a preview per chip.
 * - **Beside the chip,** never over its own day.
 * - **Never while dragging:** it closes when a drag starts and stays shut until
 *   the drag ends, or it would ride along over the day being aimed at.
 * - **Pointer only.** The underlying hover card ignores touch, and nothing in it
 *   is missing from the panel a tap opens.
 */
const preview = ref<number | null>(null)
function setPreview(cardId: number, open: boolean) {
  if (open) {
    if (dragging.value === null) preview.value = cardId
  } else if (preview.value === cardId) {
    preview.value = null
  }
}

// ─── Drag a chip to another day ──────────────────────────────────────────────

const dragging = ref<number | null>(null)
const dropTarget = ref<string | null>(null)
const MIME = 'application/x-completo-card'

function onDragStart(e: DragEvent, card: CalendarCard) {
  dragging.value = card.id
  preview.value = null
  e.dataTransfer?.setData(MIME, String(card.id))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent, day: CalendarDay) {
  if (!e.dataTransfer?.types.includes(MIME)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropTarget.value = day.key
}

function onDrop(e: DragEvent, day: CalendarDay) {
  const id = Number(e.dataTransfer?.getData(MIME))
  dropTarget.value = null
  dragging.value = null
  if (!id) return
  e.preventDefault()
  const card = props.cards.find(c => c.id === id)
  if (card && cardDay(card.dueDate) !== day.key) emit('move', id, day.key)
}

function onDragEnd() {
  dragging.value = null
  dropTarget.value = null
}

const minWidth = computed(() => props.mode === 'week' ? '980px' : '770px')
</script>

<template>
  <div class="shrink-0 rounded-xl border border-default bg-default overflow-x-auto thin-scroll">
    <div :style="{ minWidth }">
      <!-- Weekday heads; a week names each date, a month only the weekday -->
      <div class="grid grid-cols-7 border-b border-default">
        <div
          v-for="(day, i) in (mode === 'week' ? days : days.slice(0, 7))"
          :key="mode === 'week' ? day.key : i"
          class="px-3 py-2 text-xs font-medium"
          :class="[
            i > 0 ? 'border-l border-default' : '',
            mode === 'week' && day.key === today ? 'text-primary' : day.isWeekend ? 'text-dimmed' : 'text-muted'
          ]"
        >
          {{ mode === 'week' ? day.label : WEEKDAY_HEADS[i] }}
        </div>
      </div>

      <div class="grid grid-cols-7">
        <div
          v-for="(day, i) in days"
          :key="day.key"
          class="relative flex flex-col gap-1 p-1.5 transition-colors"
          :class="[
            i % 7 > 0 ? 'border-l border-default' : '',
            i >= 7 ? 'border-t border-default' : '',
            mode === 'week' ? 'min-h-96' : 'min-h-28',
            dropTarget === day.key ? 'bg-primary/10' : day.isWeekend || !day.inPeriod ? 'bg-muted' : ''
          ]"
          :data-day="day.key"
          @dragover="onDragOver($event, day)"
          @dragleave="dropTarget === day.key && (dropTarget = null)"
          @drop="onDrop($event, day)"
        >
          <div
            v-if="mode === 'month'"
            class="flex items-center justify-between px-1"
          >
            <span
              class="text-xs font-medium tabular-nums"
              :class="day.key === today
                ? 'flex items-center justify-center size-5 rounded-full bg-accent text-inverted'
                : day.inPeriod ? 'text-muted' : 'text-dimmed'"
            >
              {{ day.dayOfMonth }}
            </span>
          </div>

          <UPopover
            v-for="card in (mode === 'month' ? cardsOn(day).slice(0, MONTH_CHIPS) : cardsOn(day))"
            :key="card.id"
            mode="hover"
            :open-delay="500"
            :close-delay="100"
            :open="preview === card.id"
            :content="CARD_PREVIEW_PLACEMENT"
            :ui="{ content: 'w-96 max-h-96 flex flex-col' }"
            @update:open="(open: boolean) => setPreview(card.id, open)"
          >
            <button
              type="button"
              draggable="true"
              class="relative overflow-hidden w-full text-left rounded-md border border-default bg-default px-1.5 py-1 hover:border-accented hover:bg-elevated transition-colors cursor-grab active:cursor-grabbing"
              :class="[card.isDone ? 'opacity-50' : '', dragging === card.id ? 'opacity-40' : '', priorityBarClass(card.priority) ? 'accent-edge' : '']"
              :aria-label="`${card.ticket}: ${card.title}, ${card.statusName}${priorityBarClass(card.priority) ? `, ${priorityLabel(card.priority)} priority` : ''}. Drag to another day to move its due date.`"
              @click="emit('card-click', card)"
              @dragstart="onDragStart($event, card)"
              @dragend="onDragEnd"
            >
              <!-- Priority edge bar, as on the board (`KanbanCard`): high and urgent only. -->
              <span
                v-if="priorityBarClass(card.priority)"
                class="absolute left-0 top-0 bottom-0 w-accent-bar"
                :class="[priorityBarClass(card.priority), card.priority === 'urgent' ? 'priority-urgent-pulse' : '']"
                aria-hidden="true"
              />
              <!-- Two lines in a week, where a day has room; one in a month. -->
              <span
                class="text-xs font-medium text-highlighted"
                :class="mode === 'week' ? 'line-clamp-2 break-words' : 'block truncate'"
              >{{ card.title }}</span>
              <span
                v-if="mode === 'week'"
                class="flex items-center gap-1.5 mt-0.5 min-w-0 text-2xs text-dimmed"
              >
                <span class="font-mono shrink-0">{{ card.ticket }}</span>
                <span class="truncate">{{ card.projectName }}</span>
                <UiAvatar
                  v-if="card.assignee"
                  :src="card.assignee.avatarUrl || undefined"
                  :alt="card.assignee.name"
                  :kind="card.assignee.kind"
                  :color="card.assignee.color"
                  size="3xs"
                  class="ml-auto shrink-0"
                />
              </span>
            </button>

            <template #content>
              <CardPreview
                :card="card"
                :snippet="descriptionSnippet(card.description, '')"
              />
            </template>
          </UPopover>

          <button
            v-if="mode === 'month' && cardsOn(day).length > MONTH_CHIPS"
            type="button"
            class="px-1.5 text-left text-xs font-medium text-muted hover:text-primary transition-colors"
            @click="emit('open-day', day.key)"
          >
            +{{ cardsOn(day).length - MONTH_CHIPS }} more
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
