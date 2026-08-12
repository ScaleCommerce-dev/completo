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
        ? 'line-through text-dimmed'
        : 'text-highlighted'"
    >
      {{ title }}
    </span>
    <NuxtLink
      v-if="detailUrl"
      :to="detailUrl"
      class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-dimmed hover:text-primary hover:bg-primary/10 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
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
