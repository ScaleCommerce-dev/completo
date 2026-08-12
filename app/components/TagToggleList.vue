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
      class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs transition-colors"
      :class="selectedIds.includes(t.id)
        ? 'bg-primary/10'
        : 'hover:bg-muted'"
      @click="emit('toggle', t.id)"
    >
      <span
        class="block w-2 h-2 rounded-full shrink-0"
        :style="{ backgroundColor: t.color }"
      />
      <span
        class="truncate flex-1 font-bold uppercase tracking-wide text-xs"
        :style="{ color: t.color }"
      >
        {{ t.name }}
      </span>
      <UIcon
        v-if="selectedIds.includes(t.id)"
        name="i-lucide-check"
        class="text-sm shrink-0 text-primary"
      />
    </button>
  </div>
</template>
