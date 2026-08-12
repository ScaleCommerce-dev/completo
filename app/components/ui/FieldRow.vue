<script setup lang="ts">
/**
 * One label/control row inside a UiFieldGroup.
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
    class="flex gap-3 px-3 py-2.5 min-h-[42px]"
    :class="align === 'start' ? 'items-start' : 'items-center'"
  >
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
