<script setup lang="ts">
import type { FieldMenuOption } from '~/types/field-menu'

/** Priority picker. See `FieldMenu.vue`. */
const props = defineProps<{
  priority?: string
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const emit = defineEmits<{ select: [priority: string] }>()

/** See StatusMenu — one definition per field, exposed through the slot. */
const ariaLabel = computed(() => `Priority: ${priorityLabel(props.priority || 'medium')}. Change priority`)

// Reversed: urgent first, because a menu you open to escalate should not make
// you travel past Low to reach Urgent.
const options = computed<FieldMenuOption[]>(() => PRIORITIES.slice().reverse().map(p => ({
  label: p.label,
  checked: props.priority === p.value,
  icon: p.icon,
  iconClass: priorityTextClass(p.value),
  onSelect: () => emit('select', p.value)
})))
</script>

<template>
  <FieldMenu
    v-model:open="open"
    label="Priority"
    :options="options"
    :content="content"
  >
    <slot :label="ariaLabel" />
  </FieldMenu>
</template>
