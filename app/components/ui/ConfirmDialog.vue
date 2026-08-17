<script setup lang="ts">
/**
 * The one destructive confirmation.
 *
 * The app had four coexisting idioms for "are you sure": a type-the-name panel
 * (`DeleteConfirmation.vue`, used once and re-implemented byte-for-byte in two
 * other files), an inline banner inside the form, a separate modal, and a
 * two-step "Delete?" with a 5-second timeout. Users had to learn all four, and
 * three of them put the safe and destructive actions in different orders.
 *
 * Two levels, chosen by consequence rather than by which file you happen to be in:
 *
 *   confirmText absent  — one click. Cards, comments, attachments, tokens: things
 *                         that are cheap to recreate.
 *   confirmText set     — type the name. Projects, boards, lists, users: things
 *                         that cascade or cannot be recovered.
 *
 * Statuses were in the second group, and the fix was to stop cascading rather than
 * to ask harder: deleting one now moves its cards (`statuses/[id].delete.ts`), so
 * `StatusManager` raises the *choice* in `#body` and nothing is destroyed. That is
 * the general shape — a confirmation whose consequence needs one decision, not a
 * third level — and it is why `disabled` exists: the caller's own precondition,
 * here "a destination is chosen", gates the action the same way a typed name does.
 *
 * The button order is fixed: safe action left, destructive right. Autofocus goes
 * to Cancel, never to the destructive action.
 *
 * Consumers: `cards/[cardId]`, `ProjectMembers`, `StatusManager`, `admin/skills` and
 * the delete-view confirmation on `projects/[slug]/index`.
 *
 * What is left is not a fifth idiom but a second *mount*, and the difference
 * matters. A dialog cannot be raised from inside the card panel — a nested one
 * renders behind it, see `CardModal`'s closing comment — so `CommentList` and
 * `AttachmentList` confirm inline, and `AttachmentList` records the rest of the
 * reason: these are dense repeated rows, and a row's confirmation has to match
 * the row above it. The tag list on `projects/[slug]/index` and `ProfileTokens` are
 * the same shape on a page, and so is `StatusManager` — which uses both mounts, the
 * row for an empty status and this dialog when its cards need somewhere to go. `DeleteConfirmation.vue` is the
 * inline type-the-name, with one consumer — `ProjectForm`, which is itself
 * sometimes inside a dialog and sometimes the whole of `projects/new`.
 *
 * So the target is one confirmation vocabulary with two placements — this dialog
 * where a page raises it, inline where an overlay or a dense row does — sharing
 * the copy, the button order and the typed-name rule. Five hand-rolled inline
 * confirmations is still five, and that is the part that is owed. What is settled
 * is the two levels above and which component owns the dialog mount.
 */
const props = withDefaults(defineProps<{
  title: string
  /** What will happen, in plain terms. Not "are you sure?". */
  description?: string
  /** When set, the exact string the user must type to enable the action. */
  confirmText?: string
  /** Names what `confirmText` is, e.g. "board name". */
  confirmLabel?: string
  actionLabel?: string
  loading?: boolean
  /** The caller's own precondition — a required choice in `#body`, say. */
  disabled?: boolean
  icon?: string
}>(), {
  actionLabel: 'Delete',
  icon: 'i-lucide-triangle-alert'
})

const emit = defineEmits<{ confirm: [] }>()

const open = defineModel<boolean>('open', { required: true })

const typed = ref('')
const cancelRef = ref<{ $el?: HTMLElement } | null>(null)

const needsTyping = computed(() => !!props.confirmText)
const canConfirm = computed(() =>
  !props.loading && !props.disabled && (!needsTyping.value || typed.value.trim() === props.confirmText)
)

// Reset between openings, or a previous confirmation leaves the action armed.
watch(open, (isOpen) => {
  if (!isOpen) return
  typed.value = ''
  nextTick(() => cancelRef.value?.$el?.focus?.())
})

function confirm() {
  if (!canConfirm.value) return
  emit('confirm')
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :icon="icon"
    tone="error"
    :title="title"
    :description="description"
    size="sm"
  >
    <template
      v-if="needsTyping || $slots.body"
      #body
    >
      <div class="space-y-4">
        <slot name="body" />

        <UFormField
          v-if="needsTyping"
          :label="`Type the ${confirmLabel || 'name'} to confirm`"
        >
          <template #label>
            <span class="text-xs font-semibold uppercase tracking-label text-dimmed">
              Type <span class="text-default normal-case tracking-normal font-bold">{{ confirmText }}</span> to confirm
            </span>
          </template>
          <UInput
            v-model="typed"
            :placeholder="confirmText"
            color="error"
            autocomplete="off"
            class="w-full"
            @keydown.enter.prevent="confirm"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton
        ref="cancelRef"
        label="Cancel"
        variant="ghost"
        color="neutral"
        @click="open = false"
      />
      <UButton
        :label="actionLabel"
        color="error"
        :disabled="!canConfirm"
        :loading="loading"
        @click="confirm"
      />
    </template>
  </UiModal>
</template>
