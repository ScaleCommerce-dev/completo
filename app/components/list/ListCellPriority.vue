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
      <!-- A button, not a div: this was one of five inline list editors that were
         unreachable by keyboard because the popover trigger had no tabindex. -->
      <button
        type="button"
        :aria-label="label"
        class="flex items-center gap-1 text-sm font-medium rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer"
        :class="[priorityTextClass(priority), resting, priority === 'urgent' ? 'priority-urgent-pulse' : '']"
        @click.stop
      >
        <UIcon
          :name="priorityIcon(priority)"
          class="text-sm"
        />
        <span>{{ label }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="text-2xs shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
        />
      </button>
    </template>
  </PriorityMenu>
</template>
