<script setup lang="ts">
defineProps<{
  title: string
  isDone: boolean
  detailUrl: string | null
  hasUnread?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-1.5 min-w-0">
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
