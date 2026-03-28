<script setup lang="ts">
defineProps<{
  projectKey?: string
  projectSlug?: string
  cardId: number
}>()
</script>

<template>
  <TicketIdCopy
    :project-key="projectKey"
    :project-slug="projectSlug"
    :card-id="cardId"
  />
</template>
