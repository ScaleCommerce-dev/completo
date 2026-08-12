<script setup lang="ts">
import type { Member } from '~/types/card'

// Read-only by design — a card's creator is set once at insert and never edited,
// so there's no popover counterpart to ListCellAssignee.
defineProps<{
  creator?: Member | null
}>()
</script>

<template>
  <div class="flex items-center gap-1.5 min-h-[22px]">
    <template v-if="creator">
      <UAvatar
        :alt="creator.name"
        size="3xs"
      />
      <span class="text-muted truncate text-[13.5px]">{{ creator.name }}</span>
    </template>
    <span
      v-else
      class="text-dimmed text-[13px]"
    >Unknown</span>
  </div>
</template>
