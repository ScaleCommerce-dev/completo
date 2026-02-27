<script setup lang="ts">
defineProps<{
  projectKey?: string
  cardId: number
}>()
</script>

<template>
  <span class="card-id text-zinc-500 dark:text-zinc-400 select-none">
    {{ formatTicketId(projectKey, cardId) }}
  </span>
</template>
