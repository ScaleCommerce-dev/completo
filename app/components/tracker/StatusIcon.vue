<script setup lang="ts">
/**
 * The tracker's status glyph: the shape says the category, the colour says the
 * status. Backlog is a dashed ring, todo an empty ring, started a ring filling
 * up, completed a filled check, canceled and duplicate a filled cross. The
 * colour is the status's own and goes through `.swatch-text`, so a dark stored
 * hex stays readable in both modes (CLAUDE.md, user colour).
 */
const props = withDefaults(defineProps<{
  category: string
  color?: string | null
  size?: number
}>(), {
  color: null,
  size: 14
})

const closed = computed(() => props.category === 'canceled' || props.category === 'duplicate')
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 14 14"
    class="swatch-text shrink-0"
    :style="{ '--swatch': color || 'var(--ui-text-dimmed)', 'color': 'var(--swatch-mark)' }"
    :aria-label="category"
    role="img"
  >
    <circle
      v-if="category === 'backlog'"
      cx="7"
      cy="7"
      r="5.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="1.6 1.6"
    />
    <circle
      v-else-if="category === 'unstarted'"
      cx="7"
      cy="7"
      r="5.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <template v-else-if="category === 'started'">
      <circle
        cx="7"
        cy="7"
        r="5.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z"
        fill="currentColor"
      />
    </template>
    <template v-else-if="category === 'completed'">
      <circle
        cx="7"
        cy="7"
        r="6.25"
        fill="currentColor"
      />
      <path
        d="M4.4 7.2 6.2 9 9.7 5.2"
        fill="none"
        stroke="var(--ui-bg)"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
    <template v-else-if="closed">
      <circle
        cx="7"
        cy="7"
        r="6.25"
        fill="currentColor"
      />
      <path
        d="M5 5 9 9 M9 5 5 9"
        stroke="var(--ui-bg)"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </template>
  </svg>
</template>
