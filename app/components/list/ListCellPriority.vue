<script setup lang="ts">
defineProps<{
  priority: string
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [priority: string]
  'update:popoverOpen': [open: boolean]
}>()
</script>

<template>
  <UPopover
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <div
      class="flex items-center gap-1 text-[13px] font-medium capitalize rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
      :class="priority === 'urgent' ? 'priority-urgent-pulse' : ''"
      :style="{ color: priorityColor(priority) }"
      @click.stop
    >
      <UIcon
        :name="priorityIcon(priority)"
        class="text-[13px]"
      />
      <span>{{ priority }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="text-[10px] shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </div>
    <template #content>
      <div class="list-popover-menu py-1 min-w-[130px]">
        <button
          v-for="p in PRIORITIES"
          :key="p.value"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] font-medium capitalize transition-colors"
          :class="priority === p.value
            ? 'bg-indigo-50 dark:bg-indigo-950/30'
            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'"
          :style="{ color: p.color }"
          @click="emit('select', p.value)"
        >
          <UIcon
            :name="p.icon"
            class="text-[13px] shrink-0"
          />
          <span class="flex-1">{{ p.label }}</span>
          <UIcon
            v-if="priority === p.value"
            name="i-lucide-check"
            class="text-[13px] shrink-0 text-indigo-500"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
