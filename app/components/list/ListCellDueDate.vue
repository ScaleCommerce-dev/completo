<script setup lang="ts">
const props = defineProps<{
  dueDate: string | null | undefined
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [date: string | null]
  'update:popoverOpen': [open: boolean]
}>()

const status = computed(() => getDueDateStatus(props.dueDate))
</script>

<template>
  <DueDatePicker
    :model-value="dueDate"
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
    @update:model-value="emit('select', $event)"
  >
    <button
      type="button"
      :aria-label="dueDate ? `Due ${formatDueDate(dueDate)}. Change due date` : 'Set a due date'"
      class="flex items-center gap-1 rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer text-sm font-mono tabular-nums min-h-[22px]"
      :class="dueDate ? dueDateTextClass(status) : ''"
      @click.stop
    >
      <template v-if="dueDate">
        <UIcon
          :name="dueDateIcon(status)"
          class="text-xs"
        />
        <span>{{ formatDueDate(dueDate) }}</span>
      </template>
      <span
        v-else
        :class="EMPTY_CELL_CLASS"
      >&mdash;</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="text-2xs shrink-0 text-dimmed opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </button>
  </DueDatePicker>
</template>
