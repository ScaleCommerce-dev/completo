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

/** See `app/utils/field-labels.ts` — one definition per field, exposed through the slot. */
const ariaLabel = computed(() => assigneeFieldLabel(props.members, props.assigneeId))

const options = computed<FieldMenuOption[]>(() => [
  {
    label: 'Nobody',
    checked: !props.assigneeId,
    icon: 'i-lucide-user-x',
    iconClass: 'text-dimmed',
    onSelect: () => emit('select', null)
  },
  ...(props.members || []).map(m => ({
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
