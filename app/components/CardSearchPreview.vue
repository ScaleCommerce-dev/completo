<script setup lang="ts">
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
 *
 * The card itself is drawn by `CardPreview`, which the Calendar's hover card
 * shares, so a previewed card looks the same in both places. This component is
 * the pane around it and its resting state.
 */
defineProps<{
  card: CardHit | null
  /** The live query, for marking the words that matched. */
  query: string
}>()
</script>

<template>
  <aside
    class="w-[38%] shrink-0 flex flex-col border-l border-default bg-muted/40"
    aria-label="Card preview"
  >
    <CardPreview
      v-if="card"
      :card="card"
      :snippet="card.snippet"
      :query="query"
    />

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
