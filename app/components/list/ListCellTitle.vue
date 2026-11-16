<script setup lang="ts">
defineProps<{
  title: string
  isDone: boolean
  detailUrl: string | null
  hasUnread?: boolean
  /**
   * Set on a sub-task. `ticket` only when the parent is not a row of this
   * list — see ListView `parentMarker`.
   */
  parent?: { id: number, title: string, ticket?: string }
}>()

const emit = defineEmits<{ 'open-parent': [cardId: number] }>()
</script>

<template>
  <div class="flex items-center gap-1.5 min-w-0">
    <!-- Directly under its parent: `↳`, which with the indent it makes reads
         as a piece of the row above. Only then — the indent *is* the nesting
         cue, so a row that is not under its parent must not have one (see the
         chip after the title). -->
    <UTooltip
      v-if="parent && !parent.ticket"
      :text="`Sub-task of: ${parent.title}`"
    >
      <UIcon
        name="i-lucide-corner-down-right"
        class="shrink-0 text-sm text-dimmed"
        :aria-label="`Sub-task of: ${parent.title}`"
      />
    </UTooltip>
    <!-- Unread-activity dot, leading the title — the row's equivalent of the
         board card's corner dot. Cleared when the card is opened. -->
    <span
      v-if="hasUnread"
      class="shrink-0 size-2 rounded-full bg-primary"
      aria-label="Unread comments"
    />
    <span
      class="font-semibold truncate"
      :class="isDone
        ? 'line-through text-dimmed'
        : 'text-highlighted'"
    >
      {{ title }}
    </span>
    <!-- Away from its parent (filtered out, past retention, someone else's on
         My Tasks): the board card's `↰ TK-5`, after the title. It used to lead
         the title like `↳`, and the indent that gave it read as "sub-task of
         the row above" before anyone read the glyph. Here the title lines up
         with the top-level rows and the chip is a reference that opens the
         parent. -->
    <UTooltip
      v-if="parent?.ticket"
      :text="`Sub-task of: ${parent.title}`"
    >
      <button
        type="button"
        class="shrink-0 flex items-center gap-1 h-6 px-1 rounded-md text-2xs text-dimmed hover:text-toned hover:bg-elevated transition-colors"
        :aria-label="`Open parent, sub-task of: ${parent.title}`"
        @click.stop="emit('open-parent', parent.id)"
      >
        <UIcon
          name="i-lucide-corner-left-up"
          class="text-2xs shrink-0"
        />
        <span class="card-id">{{ parent.ticket }}</span>
      </button>
    </UTooltip>
    <!--
      The same control as the board card's, so it is the same glyph, the same
      24px box and the same hover fill. It was `arrow-up-right` in a 20px box
      that filled with `bg-primary/10` — one action with two icons, and a
      primary-tinted hover no other control in the app uses.
    -->
    <UTooltip text="Open full page">
      <NuxtLink
        v-if="detailUrl"
        :to="detailUrl"
        class="shrink-0 inline-flex items-center justify-center size-6 rounded-md text-dimmed hover:text-primary hover:bg-elevated opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-60 transition"
        @click.stop
      >
        <UIcon
          name="i-lucide-maximize-2"
          class="text-xs"
        />
      </NuxtLink>
    </UTooltip>
  </div>
</template>
