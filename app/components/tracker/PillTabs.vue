<script setup lang="ts">
/** The tracker's view tabs: small pills, the current one filled. */
defineProps<{
  items: Array<{ label: string, value: string }>
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div
    class="flex items-center gap-1"
    role="tablist"
  >
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="tab"
      :aria-selected="model === item.value"
      class="h-7 px-2.5 rounded-md border text-xs font-medium transition-colors"
      :class="model === item.value
        ? 'bg-elevated border-accented text-highlighted'
        : 'border-default text-muted hover:text-default hover:bg-elevated/50'"
      @click="model = item.value"
    >
      {{ item.label }}
    </button>
  </div>
</template>
