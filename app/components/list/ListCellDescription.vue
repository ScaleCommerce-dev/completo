<script setup lang="ts">
defineProps<{
  description: string | null | undefined
}>()
</script>

<template>
  <span class="text-dimmed text-sm line-clamp-1">
    {{ description ? stripMarkdown(description) : '' }}
  </span>
</template>
