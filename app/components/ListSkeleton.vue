<script setup lang="ts">
/**
 * List loading state. Same reason as KanbanSkeleton: the list page fetched
 * `status` and discarded it, so it rendered an empty table until data arrived.
 *
 * Row heights match ListView's (`py-2` on a 13px line), so the table does not
 * shift when it fills in.
 */
withDefaults(defineProps<{ rows?: number, columns?: number }>(), {
  rows: 8,
  columns: 6
})
</script>

<template>
  <div
    class="flex-1 overflow-hidden px-2"
    aria-busy="true"
    aria-label="Loading cards"
  >
    <div class="flex items-center gap-6 px-3 py-2 border-b border-default">
      <USkeleton
        v-for="c in columns"
        :key="`h-${c}`"
        class="h-3 flex-1"
      />
    </div>
    <div
      v-for="r in rows"
      :key="r"
      class="flex items-center gap-6 px-3 py-3 border-b border-default"
    >
      <USkeleton
        v-for="c in columns"
        :key="`${r}-${c}`"
        class="h-3.5 flex-1"
      />
    </div>
  </div>
</template>
