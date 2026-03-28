<script setup lang="ts">
const props = defineProps<{
  projectKey?: string
  projectSlug?: string
  cardId: number
}>()

const copiedState = ref<'id' | 'url' | null>(null)

function showFeedback(type: 'id' | 'url') {
  copiedState.value = type
  setTimeout(() => {
    copiedState.value = null
  }, 2000)
}

async function copyUrl() {
  await navigator.clipboard.writeText(formatTicketUrl(props.projectSlug, props.projectKey, props.cardId))
  showFeedback('url')
}

async function copyId() {
  await navigator.clipboard.writeText(formatTicketId(props.projectKey, props.cardId))
  showFeedback('id')
}
</script>

<template>
  <span
    class="group/copy card-id relative inline-flex items-center text-zinc-500 dark:text-zinc-400 select-none cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
    :title="copiedState === 'url' ? 'Link copied!' : 'Copy link'"
    @click.stop="copyUrl"
  >
    {{ formatTicketId(projectKey, cardId) }}
    <span
      class="absolute -right-10 ml-1 inline-flex items-center gap-1 opacity-0 group-hover/copy:opacity-100 transition-opacity"
      :class="{ '!opacity-100': copiedState }"
    >
      <button
        type="button"
        class="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700/50 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all"
        :class="{ 'text-green-500!': copiedState === 'url' }"
        :title="copiedState === 'url' ? 'Copied!' : 'Copy link'"
        @click.stop="copyUrl"
      >
        <UIcon
          :name="copiedState === 'url' ? 'i-lucide-check' : 'i-lucide-link'"
          class="text-[11px]"
        />
      </button>
      <button
        type="button"
        class="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700/50 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all"
        :class="{ 'text-green-500!': copiedState === 'id' }"
        :title="copiedState === 'id' ? 'Copied!' : 'Copy ticket ID'"
        @click.stop="copyId"
      >
        <UIcon
          :name="copiedState === 'id' ? 'i-lucide-check' : 'i-lucide-file-type'"
          class="text-[11px]"
        />
      </button>
    </span>
  </span>
</template>
