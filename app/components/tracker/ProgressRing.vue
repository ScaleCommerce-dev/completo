<script setup lang="ts">
/**
 * The tracker's progress circle: a hairline ring with the closed share drawn as an
 * arc. Empty is a dashed ring, for a project with no progress.
 */
const props = withDefaults(defineProps<{
  /** Closed share, 0 to 1. */
  value: number
  size?: number
}>(), {
  size: 14
})

const R = 5.5
const C = 2 * Math.PI * R
const dash = computed(() => `${Math.min(1, Math.max(0, props.value)) * C} ${C}`)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 14 14"
    class="shrink-0 -rotate-90"
    role="img"
    :aria-label="`${Math.round(value * 100)}%`"
  >
    <circle
      cx="7"
      cy="7"
      :r="R"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      class="text-dimmed"
      :stroke-dasharray="value > 0 ? undefined : '1.6 1.6'"
      :opacity="value > 0 ? 0.35 : 1"
    />
    <circle
      v-if="value > 0"
      cx="7"
      cy="7"
      :r="R"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      class="text-primary"
      :stroke-dasharray="dash"
    />
  </svg>
</template>
