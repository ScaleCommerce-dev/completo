<script setup lang="ts">
/**
 * The confirmation that cannot be a dialog.
 *
 * `ui/ConfirmDialog` is the answer wherever a page asks the question. This is the
 * same question asked in place, and it exists for two reasons that are structural
 * rather than stylistic:
 *
 *  - **Inside the card panel a dialog is unreachable.** A second dialog portals
 *    behind the panel, with its buttons under the panel's left edge — see
 *    `CardModal`'s closing comment, which records that as a real bug that reads
 *    like a z-index one. `CommentList` and `AttachmentList` have no other option.
 *  - **A dense row's confirmation belongs in the row.** Throwing a centred dialog
 *    for one of twenty comments loses the thing you were pointing at. The row
 *    lists on a page — statuses, tags, API tokens — are the same shape.
 *
 * Two levels, selected by `confirmText` exactly as `UiConfirmDialog` selects
 * them, so the level means the same thing whichever mount it appears in:
 *
 *   confirmText absent — the compact row. Comments, attachments, tokens,
 *                        statuses, tags: cheap to recreate.
 *   confirmText set    — the banner, with the name to type. Reached from a form
 *                        whose own destructive action cascades: `ProjectForm`
 *                        deletes a project with every board and card in it, and
 *                        is itself sometimes inside a dialog, so it cannot raise
 *                        one either.
 *
 * **The compact row puts the tick first, and that is deliberate.** Everywhere
 * else the safe action is on the left and the destructive one at the terminal
 * end; here the armed controls replace a trash icon *in place*, so the tick lands
 * where the pointer already is and the second click completes the gesture it
 * started. Flipping it to match the dialogs would put Cancel under the pointer
 * and make the natural second click the one that abandons. The banner does follow
 * the field rule — its input takes the row's left end, so the terminal end is the
 * right one, which is where Delete goes.
 *
 * Both levels name their controls. Three of the four compact rows this replaces
 * had two icon-only buttons with no accessible name at all; only `AttachmentList`
 * had written them.
 */
const props = defineProps<{
  /**
   * The thing being destroyed, lower case, for the controls' names — "comment"
   * becomes "Delete comment" and "Keep comment".
   */
  label: string
  /** Set to require the name typed. Its presence is what picks the level. */
  confirmText?: string
  /** What will happen, in plain terms. The banner has room for it; the row does not. */
  message?: string
  loading?: boolean
}>()

const emit = defineEmits<{ confirm: [], cancel: [] }>()

const typed = ref('')

/**
 * Trimmed on both sides: the name is displayed for the user to copy, and a
 * trailing space picked up from a double-click selection is not a different answer.
 */
const canConfirm = computed(() =>
  !props.loading && (!props.confirmText || typed.value.trim() === props.confirmText.trim())
)

function confirm() {
  if (!canConfirm.value) return
  emit('confirm')
}
</script>

<template>
  <!-- Type-the-name: a banner, because the field needs a line of its own and the
       consequence needs a sentence. -->
  <div
    v-if="confirmText"
    class="rounded-lg border border-error/30 bg-error/5 p-3"
  >
    <p class="text-sm font-medium text-error mb-2">
      {{ message }} Type <span class="font-bold">{{ confirmText }}</span> to confirm.
    </p>
    <div class="flex items-center gap-2">
      <!-- `focus:border-error` is one of the two named exceptions to "focus is
           never a colour of its own" (see the FOCUS block in main.css): on this
           field the red edge is the meaning, not the state. -->
      <input
        v-model="typed"
        type="text"
        :aria-label="`Type ${confirmText} to confirm`"
        :placeholder="confirmText"
        autocomplete="off"
        class="flex-1 min-w-0 text-base text-highlighted placeholder:text-dimmed bg-default border border-error/30 rounded-lg px-2.5 py-1.5 focus:border-error/60 transition-colors"
        @keydown.enter.prevent="confirm"
      >
      <UButton
        label="Cancel"
        variant="ghost"
        color="neutral"
        @click="emit('cancel')"
      />
      <UButton
        color="error"
        icon="i-lucide-trash-2"
        label="Delete"
        :loading="loading"
        :disabled="!canConfirm"
        @click="confirm"
      />
    </div>
  </div>

  <!-- One click: the row, in the row. `gap-1` unifies the 0.5 the two card-panel
       rows used against the 1 the two menu rows did. -->
  <div
    v-else
    class="flex items-center gap-1"
  >
    <span class="text-xs font-medium text-error">Delete?</span>
    <UButton
      icon="i-lucide-check"
      variant="ghost"
      color="error"
      size="xs"
      :aria-label="`Delete ${label}`"
      :loading="loading"
      @click="confirm"
    />
    <UButton
      icon="i-lucide-x"
      variant="ghost"
      color="neutral"
      size="xs"
      :aria-label="`Keep ${label}`"
      @click="emit('cancel')"
    />
  </div>
</template>
