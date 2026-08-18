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
    <ListCellTrigger
      :label="dueDateFieldLabel(dueDate)"
      class="gap-1 text-sm font-mono tabular-nums"
      :class="dueDate ? dueDateTextClass(status) : ''"
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
    </ListCellTrigger>
  </DueDatePicker>
</template>
