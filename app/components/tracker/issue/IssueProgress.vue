<script setup lang="ts">
/** The tracker's sub-issue progress: a ring filling up, and `completed/total`. */
const props = defineProps<{ progress: IssueProgress }>()

const R = 5
const C = 2 * Math.PI * R
const filled = computed(() => (props.progress.total ? props.progress.completed / props.progress.total : 0) * C)
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full border border-default px-2 h-6 text-xs text-muted tabular-nums shrink-0">
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      aria-hidden="true"
      class="-rotate-90"
    >
      <circle
        cx="7"
        cy="7"
        :r="R"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        opacity="0.3"
      />
      <circle
        cx="7"
        cy="7"
        :r="R"
        fill="none"
        stroke="var(--ui-success)"
        stroke-width="2"
        :stroke-dasharray="`${filled} ${C}`"
      />
    </svg>
    {{ progress.completed }}/{{ progress.total }}
  </span>
</template>
