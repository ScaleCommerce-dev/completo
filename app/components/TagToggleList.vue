<script setup lang="ts">
defineProps<{
  tags: Array<{ id: string, name: string, color: string }>
  selectedIds: string[]
}>()

const emit = defineEmits<{
  toggle: [tagId: string]
}>()
</script>

<template>
  <div class="py-1 min-w-[160px]">
    <button
      v-for="t in tags"
      :key="t.id"
      type="button"
      class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
      :class="selectedIds.includes(t.id)
        ? 'bg-indigo-50 dark:bg-indigo-950/30'
        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'"
      @click="emit('toggle', t.id)"
    >
      <span
        class="block w-2 h-2 rounded-full shrink-0"
        :style="{ backgroundColor: t.color }"
      />
      <span
        class="truncate flex-1 font-bold uppercase tracking-wide text-[11px]"
        :style="{ color: t.color }"
      >
        {{ t.name }}
      </span>
      <UIcon
        v-if="selectedIds.includes(t.id)"
        name="i-lucide-check"
        class="text-[13px] shrink-0 text-indigo-500"
      />
    </button>
  </div>
</template>
