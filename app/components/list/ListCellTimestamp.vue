<script setup lang="ts">
defineProps<{
  value: string
}>()
</script>

<template>
  <span class="text-dimmed text-sm font-mono tabular-nums">
    {{ relativeTime(value) }}
  </span>
</template>
