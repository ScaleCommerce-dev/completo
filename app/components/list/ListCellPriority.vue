<script setup lang="ts">
const props = defineProps<{
  priority: string
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [priority: string]
  'update:popoverOpen': [open: boolean]
}>()

/**
 * Medium and low wait for the row.
 *
 * Every row on the demo board read "= Medium", which is a column of identical marks
 * saying nothing — and it drowned the two rows that did carry a signal. High and urgent
 * keep their colour and stay lit; the others are a control without a value, so the
 * control appears when you reach for it and the column stays quiet until then.
 */
const resting = computed(() => isSignalPriority(props.priority)
  ? ''
  // `max-sm:` because a touch device never hovers — see EMPTY_CELL_CLASS.
  : 'opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 focus-visible:opacity-100')
</script>

<template>
  <PriorityMenu
    :priority="priority"
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', !!$event)"
    @select="emit('select', $event)"
  >
    <template #default="{ label }">
      <ListCellTrigger
        :label="label"
        chevron-class=""
        class="gap-1 text-sm font-medium"
        :class="[priorityTextClass(priority), resting, priority === 'urgent' ? 'priority-urgent-pulse' : '']"
      >
        <UIcon
          :name="priorityIcon(priority)"
          class="text-sm"
        />
        <!--
          `priorityLabel`, not the slot's `label`: that one is the *field's* name
          for a screen reader ("Priority: Urgent. Change priority"), and printing
          it here put that whole sentence in the cell. Medium and low hid it at
          `opacity-0`, so it only showed on hover — but an urgent row displayed
          it outright, wrapped over four lines, which also stretched the trigger
          to 72px and dropped this one menu 27px below its neighbours'.
        -->
        <span>{{ priorityLabel(priority) }}</span>
      </ListCellTrigger>
    </template>
  </PriorityMenu>
</template>
