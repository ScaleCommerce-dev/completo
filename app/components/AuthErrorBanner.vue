<script setup lang="ts">
defineProps<{
  error: string | null
}>()
</script>

<template>
  <div
    v-if="error"
    class="auth-field flex items-center gap-2 text-[13px] text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/30 rounded-lg px-3 py-2.5 backdrop-blur-sm border border-red-200/50 dark:border-red-800/30"
  >
    <UIcon
      name="i-lucide-alert-circle"
      class="shrink-0"
    />
    {{ error }}
  </div>
</template>
