<script setup lang="ts">
import type { FieldMenuOption } from '~/types/field-menu'

/** Assignee picker. See `FieldMenu.vue`. */
const props = defineProps<{
  members?: Array<{ id: string, name: string, avatarUrl: string | null }>
  assigneeId?: string | null
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const emit = defineEmits<{ select: [assigneeId: string | null] }>()

/** See StatusMenu — one definition per field, exposed through the slot. */
const selected = computed(() => (props.members || []).find(m => m.id === props.assigneeId))
const ariaLabel = computed(() => selected.value
  ? `Assigned to ${selected.value.name}. Change assignee`
  : 'Assign someone')

const options = computed<FieldMenuOption[]>(() => [
  {
    key: '__nobody',
    label: 'Nobody',
    checked: !props.assigneeId,
    icon: 'i-lucide-user-x',
    iconClass: 'text-dimmed',
    onSelect: () => emit('select', null)
  },
  ...(props.members || []).map(m => ({
    key: m.id,
    label: m.name,
    checked: props.assigneeId === m.id,
    avatar: { src: m.avatarUrl || undefined, alt: m.name },
    onSelect: () => emit('select', m.id)
  }))
])
</script>

<template>
  <FieldMenu
    v-model:open="open"
    label="Assignee"
    :options="options"
    :content="content"
  >
    <slot :label="ariaLabel" />
  </FieldMenu>
</template>
