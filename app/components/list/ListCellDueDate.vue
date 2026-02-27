<script setup lang="ts">
defineProps<{
  dueDate: string | null | undefined
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [date: string | null]
  'update:popoverOpen': [open: boolean]
}>()
</script>

<template>
  <DueDatePicker
    :model-value="dueDate"
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
    @update:model-value="emit('select', $event)"
  >
    <div
      class="flex items-center gap-1 rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-[13px] font-mono tabular-nums"
      :style="dueDate ? { color: dueDateColor(getDueDateStatus(dueDate)) } : {}"
      @click.stop
    >
      <template v-if="dueDate">
        <UIcon
          :name="dueDateIcon(getDueDateStatus(dueDate))"
          class="text-[12px]"
        />
        <span>{{ formatDueDate(dueDate) }}</span>
      </template>
      <span
        v-else
        class="text-zinc-300 dark:text-zinc-600"
      >&mdash;</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </div>
  </DueDatePicker>
</template>
