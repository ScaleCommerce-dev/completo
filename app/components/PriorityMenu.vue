<script setup lang="ts">
import type { FieldMenuOption } from '~/types/field-menu'

/** Priority picker. See `FieldMenu.vue`. */
const props = defineProps<{
  priority?: string | null
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const emit = defineEmits<{ select: [priority: string | null] }>()

/** See `app/utils/field-labels.ts` — one definition per field, exposed through the slot. */
const { isTracker } = useWorkspaceSettings()
const ariaLabel = computed(() => priorityFieldLabel(props.priority, isTracker.value))

// Reversed: urgent first, because a menu you open to escalate should not make
// you travel past Low to reach Urgent. The tracker interface leads with
// "No priority" (null), so a card can go back to having none,
// and draws the tracker glyphs; the standard menu keeps its four levels.
const options = computed<FieldMenuOption[]>(() => {
  const levels = PRIORITIES.slice().reverse().map(p => ({ value: p.value as string | null, label: p.label, icon: p.icon }))
  if (!isTracker.value) {
    return levels.map(p => ({
      label: p.label,
      checked: props.priority === p.value,
      icon: p.icon,
      iconClass: priorityTextClass(p.value),
      onSelect: () => emit('select', p.value)
    }))
  }
  return [{ value: null, label: priorityLabel(null), icon: priorityIcon(null) }, ...levels].map(p => ({
    label: p.label,
    checked: (props.priority ?? null) === p.value,
    priorityMark: { priority: p.value },
    onSelect: () => emit('select', p.value)
  }))
})
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
