<script setup lang="ts">
import type { Member } from '~/types/card'

// Read-only by design — a card's creator is set once at insert and never edited,
// so there's no popover counterpart to ListCellAssignee.
defineProps<{
  creator?: Member | null
}>()
</script>

<template>
  <div class="flex items-center min-h-[22px]">
    <UiPerson :person="creator" />
  </div>
</template>
