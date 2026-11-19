<script setup lang="ts">
import { matchSegments } from '#shared/utils/card-search'

/**
 * A card at a glance, read-only: what it is, where it stands, and the start of
 * what it says. One component for every place a card is previewed rather than
 * opened, so a preview looks the same wherever it appears:
 *
 * - the command palette's right-hand pane (`CardSearchPreview`), which passes
 *   the query so matched words are marked in the sentence they were found in;
 * - the Calendar's hover card (`CalendarGrid`), where a chip carries only a
 *   title and the preview answers "is it ready, who has it, which channel, and
 *   what does the post say" without opening the panel.
 *
 * It commits nothing, so it is not an overlay form: the card's form stays the
 * panel (`CardModal`), one click away from either host.
 *
 * Nothing here is fetched. Each host already holds every field it shows.
 */
export interface CardPreviewData {
  id: number
  title: string
  priority: string | null
  dueDate: string | null
  updatedAt: string
  projectKey: string
  projectName: string
  statusName: string | null
  statusColor: string | null
  /** Whether the card sits in its project's done status. */
  isDone: boolean
  assignee: { id: string, name: string, avatarUrl: string | null, kind?: 'human' | 'agent', color?: string | null } | null
  tags: Array<{ id: string, name: string, color: string }>
  /** A sub-task's parent: its title means little without it. */
  parent?: { id: number, title: string } | null
}

const props = withDefaults(defineProps<{
  card: CardPreviewData
  /** The part of the description to show, already cut to length (`descriptionSnippet`). */
  snippet: string | null
  /** A live search query, for marking the words that matched. */
  query?: string
}>(), { query: '' })

const titleSegments = computed(() => matchSegments(props.card.title, props.query))
const snippetSegments = computed(() => (props.snippet ? matchSegments(props.snippet, props.query) : []))

/**
 * Only high and urgent earn ink here, the same rule board cards and list rows
 * apply — a "Medium" on every preview is a word that never varies.
 */
const showPriority = computed(() => isSignalPriority(props.card.priority || ''))

/**
 * Tags are capped rather than wrapped freely. The demo board has a card with
 * twelve, which filled a third of the pane and pushed the description — the
 * thing the reader came here for — below it. Six is two rows at this width;
 * the rest become a count, the same trade `useTagOverflow` makes on a board
 * card, minus the measuring, because this column's width is fixed.
 */
const TAG_LIMIT = 6
const visibleTags = computed(() => props.card.tags.slice(0, TAG_LIMIT))
const hiddenTagCount = computed(() => Math.max(0, props.card.tags.length - TAG_LIMIT))
</script>

<template>
  <!-- Identity. The ticket is the handle people quote, so it leads, styled as
       ticket IDs are everywhere else (`card-id`, neutral): it names the card,
       it is not a signal, so it takes no colour. Recency sits at the far end
       because "which of these is the live one" is the other question a reader
       is asking while they scan. -->
  <div class="flex items-baseline gap-2 px-5 pt-4 pb-3 min-w-0">
    <span class="card-id text-xs text-muted shrink-0">
      {{ formatTicketId(card.projectKey, card.id) }}
    </span>
    <span class="text-xs text-dimmed truncate">{{ card.projectName }}</span>
    <span
      class="ms-auto text-2xs text-dimmed shrink-0"
      :title="formatTimestamp(card.updatedAt)"
    >{{ relativeTime(card.updatedAt) }}</span>
  </div>

  <div class="px-5 pb-4 flex flex-col gap-3 min-w-0 overflow-y-auto thin-scroll">
    <div class="flex flex-col gap-1 min-w-0">
      <!-- The one place a long title survives in full: a list column or a
           calendar chip truncates it, and the preview is why that is acceptable. -->
      <h2 class="text-sm font-semibold leading-snug text-highlighted tracking-name">
        <span
          v-for="(seg, i) in titleSegments"
          :key="i"
          :class="seg.match ? SEARCH_MARK_CLASS : ''"
        >{{ seg.text }}</span>
      </h2>
      <span
        v-if="card.parent"
        class="text-xs text-dimmed truncate"
      >↳ {{ card.parent.title }}</span>
    </div>

    <!-- Status always; the rest only when the card has one. Absent data
         looks absent, rather than costing a row of "Unassigned". -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
      <span class="inline-flex items-center gap-1.5 min-w-0">
        <UiStatusDot
          :color="card.statusColor"
          :done="card.isDone"
          size="sm"
        />
        <span class="truncate">{{ card.statusName || 'No status' }}</span>
      </span>

      <span
        v-if="showPriority"
        class="inline-flex items-center gap-1"
        :class="priorityTextClass(card.priority || '')"
      >
        <UIcon
          :name="priorityIcon(card.priority || '')"
          class="text-sm"
        />
        {{ priorityLabel(card.priority || '') }}
      </span>

      <span
        v-if="card.dueDate"
        class="inline-flex items-center gap-1"
      >
        <UIcon
          name="i-lucide-calendar"
          class="text-sm"
        />
        {{ formatDueDate(card.dueDate) }}
      </span>

      <UiPerson
        v-if="card.assignee"
        :person="card.assignee"
        size="3xs"
      />
    </div>

    <div
      v-if="visibleTags.length"
      class="flex flex-wrap items-center gap-1"
    >
      <TagPill
        v-for="tag in visibleTags"
        :key="tag.id"
        :name="tag.name"
        :color="tag.color"
        variant="quiet"
      />
      <span
        v-if="hiddenTagCount"
        class="text-2xs text-dimmed"
      >+{{ hiddenTagCount }}</span>
    </div>

    <!-- The hairline starts where the metadata ends: above it is what the
         card *is*, below it is what it says. -->
    <p
      v-if="snippetSegments.length"
      class="pt-3 border-t border-default text-xs leading-relaxed text-toned"
    >
      <span
        v-for="(seg, i) in snippetSegments"
        :key="i"
        :class="seg.match ? SEARCH_MARK_CLASS : ''"
      >{{ seg.text }}</span>
    </p>
    <p
      v-else
      class="pt-3 border-t border-default text-xs text-dimmed italic"
    >
      No description
    </p>
  </div>
</template>
