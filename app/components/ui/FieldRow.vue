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
 * `label` renders a real `<label>` bound to the control via `for`/`id` when an
 * `input-id` is given — the previous rows used a `<span>`, so clicking the label
 * did nothing and screen readers announced the control unnamed.
 */
withDefaults(defineProps<{
  label: string
  icon?: string
  /** id of the control this row labels, so the label is actually associated. */
  inputId?: string
  hint?: string
  /** Label column width. `wide` for longer names like "Confirm password". */
  labelWidth?: 'default' | 'wide'
  /** `start` for content that wraps — a row of tag pills, say — so the label
   *  stays on the first line instead of floating to the vertical middle. */
  align?: 'center' | 'start'
}>(), {
  labelWidth: 'default',
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
    <component
      :is="inputId ? 'label' : 'span'"
      :for="inputId"
      class="flex items-center gap-1.5 text-sm font-medium text-muted shrink-0"
      :class="[
        labelWidth === 'wide' ? 'w-[132px]' : 'w-[74px]',
        align === 'start' ? 'min-h-[26px]' : ''
      ]"
    >
      <UIcon
        v-if="icon"
        :name="icon"
        class="text-sm text-dimmed"
      />
      {{ label }}
    </component>

    <div
      class="flex-1 min-w-0 flex gap-2"
      :class="align === 'start' ? 'items-start' : 'items-center'"
    >
      <slot />
    </div>

    <span
      v-if="hint"
      class="text-xs text-dimmed shrink-0"
    >{{ hint }}</span>
    <slot name="trailing" />
  </div>
</template>
