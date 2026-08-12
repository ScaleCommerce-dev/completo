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

const iconSize = computed(() => variant.value === 'pill' ? 'text-xs' : 'text-xs')
const iconOffset = computed(() => variant.value === 'pill' ? '-right-11' : '-right-10')
</script>

<template>
  <span
    class="group/copy relative inline-flex items-center select-none cursor-pointer transition-colors"
    :class="variant === 'pill'
      ? 'card-id font-mono text-xs font-semibold text-dimmed bg-elevated px-1.5 py-0.5 rounded-md hover:text-toned'
      : 'card-id text-muted hover:text-toned'"
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
        class="p-0.5 rounded-md hover:bg-elevated hover:text-primary transition-colors"
        :class="{ 'text-success!': copiedState === 'url' }"
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
        class="p-0.5 rounded-md hover:bg-elevated hover:text-primary transition-colors"
        :class="{ 'text-success!': copiedState === 'id' }"
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
