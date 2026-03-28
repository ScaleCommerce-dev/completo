<script setup lang="ts">
const props = defineProps<{
  projectKey?: string
  projectSlug?: string
  cardId: number
  variant?: 'plain' | 'pill'
}>()

const variant = computed(() => props.variant || 'plain')

const { copiedState, copyUrl, copyId } = useCopyTicketId(
  () => props.projectSlug,
  () => props.projectKey,
  () => props.cardId
)

const iconSize = computed(() => variant.value === 'pill' ? 'text-[12px]' : 'text-[11px]')
const iconOffset = computed(() => variant.value === 'pill' ? '-right-11' : '-right-10')
</script>

<template>
  <span
    class="group/copy relative inline-flex items-center select-none cursor-pointer transition-colors"
    :class="variant === 'pill'
      ? 'card-id font-mono text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded hover:text-zinc-600 dark:hover:text-zinc-300'
      : 'card-id text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'"
    :title="copiedState === 'url' ? 'Link copied!' : 'Copy link'"
    @click.stop="copyUrl"
  >
    {{ formatTicketId(projectKey, cardId) }}
    <span
      class="absolute ml-1 inline-flex items-center gap-1 opacity-0 group-hover/copy:opacity-100 transition-opacity"
      :class="[iconOffset, { '!opacity-100': copiedState }]"
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
          :class="iconSize"
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
          :class="iconSize"
        />
      </button>
    </span>
  </span>
</template>
