<script setup lang="ts">
defineProps<{
  description: string | null | undefined
}>()
</script>

<template>
  <span class="text-zinc-400 dark:text-zinc-500 text-[13px] line-clamp-1">
    {{ description ? stripMarkdown(description) : '' }}
  </span>
</template>
