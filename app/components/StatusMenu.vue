<script setup lang="ts">
import type { FieldMenuOption } from '~/types/field-menu'

/** Status picker. See `FieldMenu.vue` for why all four fields share one menu. */
const props = defineProps<{
  statuses: Array<{ id: string, name: string, color: string | null }>
  statusId?: string | null
  doneStatusId?: string | null
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const emit = defineEmits<{ select: [statusId: string] }>()

/**
 * The trigger's accessible name, handed to the call site through the slot.
 *
 * Defined in `app/utils/field-labels.ts`, with the other four, rather than here:
 * a name written at each call site had already drifted (an unset status read
 * "none" in the card panel and "Set a status" in the list), and the board card
 * now needs the name without mounting the menu that owns the field.
 */
const ariaLabel = computed(() => statusFieldLabel(props.statuses, props.statusId))

const options = computed<FieldMenuOption[]>(() => props.statuses.map(s => ({
  label: s.name,
  checked: props.statusId === s.id,
  swatch: s.color,
  done: s.id === props.doneStatusId,
  onSelect: () => emit('select', s.id)
})))
</script>

<template>
  <FieldMenu
    v-model:open="open"
    label="Status"
    :options="options"
    :content="content"
  >
    <slot :label="ariaLabel" />
  </FieldMenu>
</template>
