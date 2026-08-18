<script setup lang="ts">
import type { FieldMenuOption } from '~/types/field-menu'

/**
 * Tag picker. See `FieldMenu.vue`.
 *
 * This replaced `TagToggleList`, a hand-rolled list of buttons in a plain
 * popover that had missed two rounds of fixes: it painted the user's tag colour
 * straight onto the text, which is the contrast bug that made a dark tag
 * unreadable in dark mode, and it still forced tag names into capitals after
 * that was dropped everywhere else. Both are gone by construction — the colour
 * is a `UiStatusDot`, derived per theme, and the name is rendered by the menu.
 */
const props = defineProps<{
  tags: Array<{ id: string, name: string, color: string }>
  selectedIds: string[]
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const emit = defineEmits<{ toggle: [tagId: string] }>()

/** See `app/utils/field-labels.ts` — one definition per field, exposed through the slot. */
const ariaLabel = computed(() => tagsFieldLabel(props.tags, props.selectedIds))

const options = computed<FieldMenuOption[]>(() => props.tags.map(t => ({
  key: t.id,
  label: t.name,
  checked: props.selectedIds.includes(t.id),
  swatch: t.color,
  onSelect: () => emit('toggle', t.id)
})))
</script>

<template>
  <FieldMenu
    v-model:open="open"
    label="Tags"
    :options="options"
    multiple
    :content="content"
  >
    <slot :label="ariaLabel" />
  </FieldMenu>
</template>
