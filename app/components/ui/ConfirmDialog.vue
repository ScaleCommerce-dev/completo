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
 *   confirmText set     — type the name. Projects, boards, lists, statuses,
 *                         users: things that cascade or cannot be recovered.
 *
 * The button order is fixed: safe action left, destructive right. Autofocus goes
 * to Cancel, never to the destructive action.
 *
 * Two of the four idioms are still live. `DeleteConfirmation.vue` — the one this
 * supersedes — is still rendered by `ProjectForm`, and the two-step inline
 * "Delete?" with a timeout survives in `StatusManager`, `CommentList`,
 * `ViewConfigModal`, `ProfileTokens` and `projects/[slug]/index`. Current
 * consumers are `AttachmentList` and `cards/[cardId]`. So the four idioms are
 * not yet one; what is settled is which one wins, and each of those files is a
 * migration owed rather than a variant with a reason.
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
  !props.loading && (!needsTyping.value || typed.value.trim() === props.confirmText)
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
      v-if="needsTyping"
      #body
    >
      <UFormField :label="`Type the ${confirmLabel || 'name'} to confirm`">
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
