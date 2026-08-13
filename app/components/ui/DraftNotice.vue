<script setup lang="ts">
/**
 * "The text in this editor came back from a previous session."
 *
 * `useTextDraft` restores silently, which on its own is worse than losing the
 * text: prose you don't remember typing appears in a field, and on a card that
 * is indistinguishable from something a colleague saved. The notice is what
 * makes restoration legible, and the discard is the only way back to what the
 * server actually holds.
 *
 * Deliberately not an alert colour. Nothing has gone wrong — this is the safety
 * net working, and painting it as a warning would make every recovered comment
 * look like an error.
 */
defineProps<{
  /** What came back, so the copy can name it: "draft", "comment". */
  label?: string
}>()

const emit = defineEmits<{ discard: [] }>()
</script>

<template>
  <div class="flex items-center gap-1.5 text-xs text-muted">
    <UIcon
      name="i-lucide-history"
      class="text-sm text-dimmed shrink-0"
    />
    <span class="min-w-0 truncate">Restored your unsaved {{ label || 'draft' }}</span>
    <button
      type="button"
      class="ml-auto shrink-0 rounded-md px-1.5 py-1 font-medium text-dimmed hover:text-error hover:bg-error/10 transition-colors"
      @click="emit('discard')"
    >
      Discard
    </button>
  </div>
</template>
