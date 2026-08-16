<script setup lang="ts">
/**
 * The button every editable list cell opens its menu from.
 *
 * Five cells — assignee, status, priority, due date, tags — each hand-rolled the
 * same trigger: identical hit area (`px-1 -mx-1` so the hover surface bleeds
 * past the text without moving it), identical `min-h-cell` so all five rows sit
 * on one rhythm, and a byte-identical chevron that fades in with the row.
 *
 * It is a `<button>`, and that is the load-bearing part rather than the styling:
 * all five were `<div>`s, so every inline editor in the list was unreachable
 * without a mouse. Keeping one trigger is what stops the sixth cell from
 * reinventing that.
 *
 * Cell-specific type and spacing stay at the call site — the date cell is mono
 * and tabular, priority carries its own colour — because those belong to the
 * field, not to the trigger. Vue merges them onto the root.
 */
withDefaults(defineProps<{
  /** The field's own name and state, e.g. "Priority: Urgent. Change priority". */
  label: string
  /** Assignee hides it when nobody is assigned: there is nothing to change *from*. */
  chevron?: boolean
  /** Priority tints its chevron to match the value, so it opts out of the default. */
  chevronClass?: string
}>(), {
  chevron: true,
  chevronClass: 'text-dimmed'
})
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    class="flex items-center rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer min-h-cell"
    @click.stop
  >
    <slot />
    <UIcon
      v-if="chevron"
      name="i-lucide-chevron-down"
      class="text-2xs shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
      :class="chevronClass"
    />
  </button>
</template>
