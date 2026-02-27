<script setup lang="ts">
defineProps<{
  value: string
}>()
</script>

<template>
  <span class="text-zinc-400 dark:text-zinc-500 text-[13px] font-mono tabular-nums">
    {{ relativeTime(value) }}
  </span>
</template>
