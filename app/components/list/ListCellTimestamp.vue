<script setup lang="ts">
defineProps<{
  value: string
}>()
</script>

<template>
  <span class="text-dimmed text-[13px] font-mono tabular-nums">
    {{ relativeTime(value) }}
  </span>
</template>
