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
 * It lives here because it was written three times otherwise — and had already
 * drifted: an unset status read "none" in the card panel and "Set a status" in
 * the list. One definition per field, next to the menu that owns the field.
 */
const selected = computed(() => props.statuses.find(s => s.id === props.statusId))
const ariaLabel = computed(() => selected.value
  ? `Status: ${selected.value.name}. Change status`
  : 'Set a status')

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
