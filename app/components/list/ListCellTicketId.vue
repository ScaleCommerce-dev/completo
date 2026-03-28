<script setup lang="ts">
const props = defineProps<{
  projectKey?: string
  cardId: number
}>()

const copied = ref(false)
async function copyTicketId() {
  await navigator.clipboard.writeText(formatTicketId(props.projectKey, props.cardId))
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <button
    type="button"
    class="group/copy card-id relative inline-flex items-center text-zinc-500 dark:text-zinc-400 select-none hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
    :title="copied ? 'Copied!' : 'Copy ticket ID'"
    @click.stop="copyTicketId"
  >
    {{ formatTicketId(projectKey, cardId) }}
    <UIcon
      :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      class="absolute -right-3.5 text-[11px] opacity-0 group-hover/copy:opacity-100 transition-opacity"
      :class="{ '!opacity-100 text-green-500': copied }"
    />
  </button>
</template>
