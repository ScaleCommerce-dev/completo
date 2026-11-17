<script setup lang="ts">
/**
 * One label/control row in a divided stack.
 *
 * There used to be a `UiFieldGroup` wrapper supplying the border and the
 * hairlines. It had exactly one consumer — `CardProperties`' `rows` layout — whose
 * only host is a card that already has a border, so the wrapper's contribution was
 * a bordered box 12px inside a bordered box. The dividers moved into
 * `CardProperties` and the border belongs to the host.
 *
 * Its docstring claimed it had replaced a duplicated class string in five files.
 * It hadn't: `ProjectForm`, `CreateViewModal`, `ProfileSecurity`, `ProfileSettings`
 * and `ProfileTokens` still hand-roll `rounded-lg border … divide-y divide-default
 * overflow-hidden`. That migration is still owed; it just isn't served by a
 * component with no callers.
 *
 * The label is a `<span>`: every control in these rows is a menu trigger or a
 * readout that carries its own name (`aria-label`), so there is no form field
 * for a `<label for>` to point at. `input-id`, `hint`, `label-width` and a
 * `#trailing` slot were here for callers that never came, and are gone.
 */
withDefaults(defineProps<{
  label: string
  icon?: string
  /** `start` for content that wraps — a row of tag pills, say — so the label
   *  stays on the first line instead of floating to the vertical middle. */
  align?: 'center' | 'start'
}>(), {
  align: 'center'
})
</script>

<template>
  <div
    class="flex gap-3 px-4 py-2.5 min-h-row"
    :class="align === 'start' ? 'items-start' : 'items-center'"
  >
    <!-- The 26px label floor only exists for `align: start`, where the label has
         to hold the first line's box while the value grows past it. One file, so
         it stays a literal; the row height beside it is `min-h-row`. -->
    <span
      class="flex items-center gap-1.5 text-sm font-medium text-muted shrink-0 w-[74px]"
      :class="align === 'start' ? 'min-h-[26px]' : ''"
    >
      <UIcon
        v-if="icon"
        :name="icon"
        class="text-sm text-dimmed"
      />
      {{ label }}
    </span>

    <div
      class="flex-1 min-w-0 flex gap-2"
      :class="align === 'start' ? 'items-start' : 'items-center'"
    >
      <slot />
    </div>
  </div>
</template>
