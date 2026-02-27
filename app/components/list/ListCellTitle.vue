<script setup lang="ts">
defineProps<{
  title: string
  isDone: boolean
  detailUrl: string | null
}>()
</script>

<template>
  <div class="flex items-center gap-1.5 min-w-0">
    <span
      class="font-semibold truncate"
      :class="isDone
        ? 'line-through text-zinc-400 dark:text-zinc-500'
        : 'text-zinc-900 dark:text-zinc-100'"
    >
      {{ title }}
    </span>
    <NuxtLink
      v-if="detailUrl"
      :to="detailUrl"
      class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-zinc-300 dark:text-zinc-600 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
      title="Open detail"
      @click.stop
    >
      <UIcon
        name="i-lucide-arrow-up-right"
        class="text-[13px]"
      />
    </NuxtLink>
  </div>
</template>
