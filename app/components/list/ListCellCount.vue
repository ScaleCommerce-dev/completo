<script setup lang="ts">
/**
 * A comment or attachment count.
 *
 * Read-only: both are consequences of what is on the card, not fields you set
 * from a table row. Zero renders as nothing rather than `0` — a column of
 * zeroes is the "ten rows of Unassigned" problem, and the rows that carry a
 * number are the whole point of showing the column.
 */
defineProps<{
  count?: number
  icon: string
}>()
</script>

<template>
  <div class="flex items-center gap-1 min-h-[22px] text-sm text-muted font-mono tabular-nums">
    <template v-if="count">
      <UIcon
        :name="icon"
        class="text-xs text-dimmed shrink-0"
      />
      <span>{{ count }}</span>
    </template>
    <span
      v-else
      :class="EMPTY_CELL_CLASS"
    >&mdash;</span>
  </div>
</template>
