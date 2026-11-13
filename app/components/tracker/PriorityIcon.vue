<script setup lang="ts">
/**
 * The tracker's priority glyph: three bars filling up for low, medium and high, an
 * exclamation tile for urgent, and three dots for no priority (null). Colour
 * follows the app's priority vocabulary (`priorityTextClass`): only high and
 * urgent spend any, so a list of medium issues stays quiet.
 */
const props = withDefaults(defineProps<{
  priority?: string | null
  size?: number
}>(), {
  priority: null,
  size: 14
})

const FILLED: Record<string, number> = { low: 1, medium: 2, high: 3 }
const tone = computed(() => props.priority === 'urgent' || props.priority === 'high'
  ? priorityTextClass(props.priority)
  : 'text-muted')
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 14 14"
    class="shrink-0"
    :class="tone"
    :aria-label="priority ? `Priority ${priorityLabel(priority)}` : 'No priority'"
    role="img"
  >
    <template v-if="priority === 'urgent'">
      <rect
        x="1"
        y="1"
        width="12"
        height="12"
        rx="3"
        fill="currentColor"
      />
      <path
        d="M7 3.8v4.2"
        stroke="var(--ui-bg)"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <circle
        cx="7"
        cy="10.1"
        r="0.9"
        fill="var(--ui-bg)"
      />
    </template>
    <template v-else-if="priority && FILLED[priority]">
      <rect
        v-for="(h, i) in [5, 8, 11]"
        :key="i"
        :x="1.5 + i * 4"
        :y="12.5 - h"
        width="3"
        :height="h"
        rx="1"
        fill="currentColor"
        :opacity="i < FILLED[priority]! ? 1 : 0.3"
      />
    </template>
    <template v-else>
      <circle
        v-for="i in 3"
        :key="i"
        :cx="2.5 + (i - 1) * 4.5"
        cy="7"
        r="1.1"
        fill="currentColor"
      />
    </template>
  </svg>
</template>
