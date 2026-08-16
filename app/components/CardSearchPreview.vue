<script setup lang="ts">
import { matchSegments } from '#shared/utils/card-search'
import type { CardHit } from '~/composables/useCardSearch'

/**
 * The right-hand pane of the command palette: the card the selection is on.
 *
 * It exists because a row cannot say why it is in the list. Searching "table"
 * returns a card titled "view name not editable, but rather dropdown to switch
 * view" — a correct hit, matched on its description, that reads as a mis-hit
 * until you open it. The pane answers that in place, with the matched words
 * marked in the sentence they were found in.
 *
 * **Vertical split, not horizontal.** Measured against the dialog rather than
 * chosen by taste. Landscape (1024×448) splits vertically into two portrait
 * panes — the shape of a scrolling list and the shape of a document; splitting
 * it horizontally gives two letterboxes at 3.2:1 and 4.8:1, where a description
 * line runs ~96 characters against the 60–75 the eye tracks, and four lines fit
 * before the pane clips. The selection also moves *vertically*: beside the list
 * the pane is a fixed target, below it the highlight moves toward the pane and
 * the eye's travel changes with every keystroke. And a horizontal split caps the
 * whole palette — Cards, Go to and Actions together — at about seven rows
 * instead of twelve, which is the wrong thing to spend on a secondary surface.
 *
 * The dialog widened from 48rem to 64rem to pay for the pane rather than taking
 * it out of the list: at 48rem a 60/40 split leaves ~35 characters of title,
 * so most rows truncate mid-word. See the `#content` slot in `default.vue`.
 *
 * Nothing here is fetched. `/api/cards/search` returns everything the pane
 * shows, so arrowing through results is instant and has no loading state.
 */
const props = defineProps<{
  card: CardHit | null
  /** The live query, for marking the words that matched. */
  query: string
}>()

const titleSegments = computed(() => (props.card ? matchSegments(props.card.title, props.query) : []))
const snippetSegments = computed(() => (props.card?.snippet ? matchSegments(props.card.snippet, props.query) : []))

/**
 * Only high and urgent earn ink here, the same rule board cards and list rows
 * apply — a "Medium" on every preview is a word that never varies.
 */
const showPriority = computed(() => !!props.card && isSignalPriority(props.card.priority || ''))

/**
 * Tags are capped rather than wrapped freely. The demo board has a card with
 * twelve, which filled a third of the pane and pushed the description — the
 * thing the reader came here for — below it. Six is two rows at this width;
 * the rest become a count, the same trade `useTagOverflow` makes on a board
 * card, minus the measuring, because this column's width is fixed.
 */
const TAG_LIMIT = 6
const visibleTags = computed(() => props.card?.tags.slice(0, TAG_LIMIT) || [])
const hiddenTagCount = computed(() => Math.max(0, (props.card?.tags.length || 0) - TAG_LIMIT))
</script>

<template>
  <aside
    class="w-[38%] shrink-0 flex flex-col border-l border-default bg-muted/40"
    aria-label="Card preview"
  >
    <template v-if="card">
      <!-- Identity. The ticket is the handle people quote, so it leads in the
           same mono face ticket IDs use everywhere else; recency sits at the far
           end because "which of these is the live one" is the other question a
           reader is asking while they scan. -->
      <div class="flex items-baseline gap-2 px-5 pt-4 pb-3 min-w-0">
        <span class="font-mono text-xs font-semibold text-primary shrink-0">
          {{ formatTicketId(card.projectKey, card.id) }}
        </span>
        <span class="text-xs text-dimmed truncate">{{ card.projectName }}</span>
        <span
          class="ms-auto text-2xs text-dimmed shrink-0"
          :title="formatTimestamp(card.updatedAt)"
        >{{ relativeTime(card.updatedAt) }}</span>
      </div>

      <div class="px-5 pb-4 flex flex-col gap-3 min-w-0 overflow-y-auto thin-scroll">
        <!-- The one place a long title survives in full: the list column
             truncates it, and this pane is why that is acceptable. -->
        <h2 class="text-sm font-semibold leading-snug text-highlighted tracking-name">
          <span
            v-for="(seg, i) in titleSegments"
            :key="i"
            :class="seg.match ? SEARCH_MARK_CLASS : ''"
          >{{ seg.text }}</span>
        </h2>

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

    <!--
      Resting state, for a selection that is not a card — a project, an action.
      A key legend rather than an illustration or an empty box: the pane is
      already reserved, the shortcuts are the thing a reader of this surface has
      a use for, and `UiKey` is the app's own drawn-key vocabulary rather than
      characters no font on any platform carries (see UiKey).
    -->
    <div
      v-else
      class="flex-1 flex flex-col items-center justify-center gap-2.5 px-5 text-xs text-dimmed"
    >
      <div
        v-for="row in [
          { keys: ['arrowup', 'arrowdown'], label: 'move' },
          { keys: ['enter'], label: 'open' },
          { keys: ['escape'], label: 'close' }
        ]"
        :key="row.label"
        class="grid grid-cols-[auto_1fr] items-center gap-3 w-24"
      >
        <span class="flex items-center gap-1 justify-end">
          <UiKey
            v-for="key in row.keys"
            :key="key"
            :value="key"
            variant="subtle"
          />
        </span>
        <span>{{ row.label }}</span>
      </div>
    </div>
  </aside>
</template>
