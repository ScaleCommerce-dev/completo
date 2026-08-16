<script setup lang="ts">
/**
 * The action row under a *field* — a description, a comment, a quick-add
 * composer. `UiSaveBar` is the same act for a *surface*: a modal, a page, a
 * panel.
 *
 * Two components rather than one because the difference is real, and a single
 * bar was already tried: `UiSaveBar` hardcodes `ml-auto`, `md` and primary-last,
 * which is why the four field rows could not adopt it and hand-rolled instead.
 * Generalising it with flags would have produced a component whose every prop
 * asks the caller to re-decide something this pair answers by which one you pick.
 *
 * Both obey one rule: **the primary sits at the row's terminal end.**
 *
 *   surface-scoped → right-aligned → primary rightmost   (UiSaveBar)
 *   field-scoped   → left-aligned  → primary leftmost    (this)
 *
 * That is not two conventions, it is one on a mirrored axis, and the mirror is
 * the point: a field row aligns to the left edge of the field it commits, so its
 * terminal end is the left one. Putting Cancel there instead would seat the safe
 * action in the spot the eye returns to and offset the commit — which is why
 * three authors independently wrote Save-before-Cancel here, and why an audit of
 * all 21 action rows found 20 already obeying the terminal-end rule without it
 * ever being written down.
 *
 * `xs`, because a field row sits inside the field's own container and a `md`
 * button there outweighs the text it is committing.
 */
withDefaults(defineProps<{
  submitLabel?: string
  cancelLabel?: string
  loading?: boolean
  disabled?: boolean
  /**
   * Which shortcut the primary announces, or `false` for none. Pass only what a
   * handler actually listens for — the quick-add composer commits on a bare ⏎
   * and said so in a span floating at the opposite end of the row, which is the
   * one place in the app a hint was not attached to the thing it fires.
   */
  shortcut?: 'meta-enter' | 'enter' | false
}>(), {
  submitLabel: 'Save',
  cancelLabel: 'Cancel',
  shortcut: 'meta-enter'
})

const emit = defineEmits<{
  submit: []
  cancel: []
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      size="xs"
      :label="submitLabel"
      :loading="loading"
      :disabled="disabled"
      @click="emit('submit')"
    >
      <!-- `#trailing` rather than the default slot: the slot spells the gap as
           the button's own `gap-1`, where three call sites had written the keys
           inline and got a different rhythm from `UiSaveBar` for the same hint.
           `UiShortcutKeys` owns the responsive rule, so neither row decides it. -->
      <template
        v-if="shortcut"
        #trailing
      >
        <UiShortcutKeys :keys="shortcut" />
      </template>
    </UButton>

    <UButton
      size="xs"
      variant="ghost"
      color="neutral"
      :label="cancelLabel"
      @click="emit('cancel')"
    />

    <slot name="extra" />
  </div>
</template>
