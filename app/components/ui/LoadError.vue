<script setup lang="ts">
/**
 * A page's data did not arrive.
 *
 * Without it, a failed fetch left `data` empty and the page rendered its empty
 * state, so an outage read as "you have no projects" or "Nothing assigned to you",
 * a claim about the user's data the app had no basis for. Pages gate their empty
 * state on `status === 'success'` and show this for `'error'`.
 */
defineProps<{
  /** What failed to load, for the title: "your tasks", "projects". */
  what: string
  error?: unknown
}>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <UEmpty
    class="py-16"
    icon="i-lucide-cloud-off"
    :title="`Couldn't load ${what}`"
    :description="getErrorMessage(error, 'Check your connection and try again.')"
    :actions="[{ label: 'Try again', icon: 'i-lucide-rotate-cw', color: 'neutral', variant: 'outline', onClick: () => emit('retry') }]"
  />
</template>
