<script setup lang="ts">
/**
 * The action row under a *surface* — a modal, a page, a panel. `UiCommitRow` is
 * the same act for a *field*, and the two are a pair; read its docstring for why
 * there are two and not one.
 *
 * Every modal had invented its own: button order differed in all eleven, the
 * ⌘⏎ hint existed in six spellings (five inline `<kbd>` blocks, one literal
 * "Cmd+Enter" text), and CardModal had no Cancel button at all while the card
 * detail page made the *safe* action a filled button.
 *
 * The order is fixed: destructive far left, status text, then Cancel and the
 * primary on the right. Stated generally, it is the rule both rows share — the
 * primary sits at the row's *terminal end*, and for a right-aligned row that is
 * the right. Cancel is quieter than the primary without asking, because
 * `app.config.ts` rests every ghost neutral button at `text-dimmed`.
 *
 * Neither row gives its primary an icon, and that is the rule rather than an
 * omission: an icon earns its place by saying something the label does not.
 * `plus` on Create says a new thing appears — information the word alone does not
 * carry, and it is on all four Create buttons. Save had three answers (`check`,
 * `save`, nothing), and the first two only restate the word beside them; a floppy
 * disk next to "Save" is a picture of the label. So Create carries `plus`, Save
 * carries nothing, and a destructive action keeps `trash-2` because it is the one
 * an eye should catch before reading.
 *
 * This bar is still only used by `admin/users`, and that is now a scoping fact
 * rather than a failure: the four rows that most needed sharing were field rows,
 * which is why they could not adopt a bar hardcoded to `ml-auto`, `md` and
 * primary-last. They went to `UiCommitRow` instead. What remains here is modal
 * footers, which are structurally fine as they are — migrating them is a diff
 * with no user-visible outcome, so it has not been spent.
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
          <UiShortcutKeys />
        </template>
      </UButton>
    </div>
  </div>
</template>
