<script setup lang="ts">
/**
 * The footer action row shared by every editing surface.
 *
 * Every modal had invented its own: button order differed in all eleven, the
 * ⌘⏎ hint existed in six spellings (five inline `<kbd>` blocks, one literal
 * "Cmd+Enter" text), and CardModal had no Cancel button at all while the card
 * detail page made the *safe* action a filled button.
 *
 * The order is fixed and the same everywhere: destructive far left, status text,
 * then Cancel and the primary action on the right — primary last, because that is
 * where the eye lands and where the keyboard arrives.
 */
withDefaults(defineProps<{
  submitLabel?: string
  cancelLabel?: string
  /** Renders a ghost destructive button pinned left. */
  destructiveLabel?: string
  loading?: boolean
  disabled?: boolean
  /** Shows the ⌘⏎ hint. Only pass when a global handler actually listens. */
  shortcut?: boolean
  /** Left-aligned status or validation text, e.g. "Slug already taken". */
  status?: string
  statusTone?: 'muted' | 'warning' | 'error' | 'success'
  /** `error` when the primary action is itself the destructive one — a delete
   *  confirmation has no separate destructive slot, the submit *is* the delete. */
  submitTone?: 'primary' | 'error'
}>(), {
  submitLabel: 'Save',
  cancelLabel: 'Cancel',
  shortcut: true,
  statusTone: 'muted',
  submitTone: 'primary'
})

const emit = defineEmits<{
  submit: []
  cancel: []
  destructive: []
}>()

const STATUS_TONES = {
  muted: 'text-dimmed',
  warning: 'text-warning',
  error: 'text-error',
  success: 'text-success'
}
</script>

<template>
  <div class="flex items-center gap-2 w-full">
    <UButton
      v-if="destructiveLabel"
      :label="destructiveLabel"
      icon="i-lucide-trash-2"
      variant="ghost"
      color="error"
      @click="emit('destructive')"
    />

    <span
      v-if="status"
      class="text-sm font-medium truncate"
      :class="STATUS_TONES[statusTone]"
    >{{ status }}</span>

    <div class="ml-auto flex items-center gap-2 shrink-0">
      <slot name="extra" />

      <UButton
        :label="cancelLabel"
        variant="ghost"
        color="neutral"
        @click="emit('cancel')"
      />

      <UButton
        :label="submitLabel"
        :color="submitTone"
        :loading="loading"
        :disabled="disabled"
        @click="emit('submit')"
      >
        <template
          v-if="shortcut"
          #trailing
        >
          <UKbd
            value="meta"
            size="sm"
            class="max-sm:hidden"
          />
          <UKbd
            value="enter"
            size="sm"
            class="max-sm:hidden"
          />
        </template>
      </UButton>
    </div>
  </div>
</template>
