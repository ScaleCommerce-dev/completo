<script setup lang="ts">
/**
 * Board loading state.
 *
 * The board page fetched `status` and threw it away (`status: _status`), so it
 * rendered an empty shell — no columns, no cards, no indication anything was
 * coming — until the request landed.
 *
 * The shape mirrors the real board closely enough that nothing jumps when the
 * data arrives: same column width, same card gap, same header height.
 */
const COLUMNS = [3, 2, 4, 1]
</script>

<template>
  <div
    class="flex gap-3 px-4 py-4 flex-1 min-h-0 overflow-hidden"
    aria-busy="true"
    aria-label="Loading board"
  >
    <div
      v-for="(cards, i) in COLUMNS"
      :key="i"
      class="flex flex-col w-column shrink-0 rounded-xl bg-muted border border-default"
    >
      <div class="flex items-center gap-2 px-3 py-2.5">
        <USkeleton class="size-2.5 rounded-full" />
        <USkeleton class="h-3.5 w-24" />
      </div>
      <div class="flex flex-col gap-1.5 px-2 pb-2">
        <USkeleton
          v-for="n in cards"
          :key="n"
          class="h-[68px]"
        />
      </div>
    </div>
  </div>
</template>
