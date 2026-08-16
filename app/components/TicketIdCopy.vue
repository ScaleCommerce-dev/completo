<script setup lang="ts">
const props = defineProps<{
  projectKey?: string
  projectSlug?: string
  cardId: number
  variant?: 'plain' | 'pill'
  /**
   * `xs` is the board card's whisper: the ID is metadata for the CLI, URLs and
   * reading a ticket number out loud, not the card's headline. It stays legible
   * and stays a copy target — it just stops competing with the title.
   *
   * It also drops the two slide-out buttons. They were absolutely positioned and
   * landed on top of the attachment count beside them, and on a board card they
   * put *actions* in the corner reserved for facts — the ID, the comment and
   * attachment counts — while the card's field controls lived at the
   * opposite end. Clicking the ID copies its link either way; copying the bare
   * ID stays available wherever the card is actually open.
   */
  size?: 'xs' | 'sm'
  /**
   * The slide-out buttons are absolutely positioned ~40px right of the ID, so
   * they need that much clear space beside them. In an 88px table cell they do
   * not have it: they rendered 7px into the next column, over its content, on
   * every row hover — the same overlap that got them dropped from the board
   * card. Defaults to on for the card surfaces, which have the room.
   */
  copyButtons?: boolean
}>()

const showCopyButtons = computed(() => props.copyButtons ?? props.size !== 'xs')

const variant = computed(() => props.variant || 'plain')
const plainClass = computed(() => props.size === 'xs'
  ? 'card-id text-2xs text-dimmed hover:text-toned'
  : 'card-id text-muted hover:text-toned')

const { copiedState, copyUrl, copyId } = useCopyTicketId(
  () => props.projectSlug,
  () => props.projectKey,
  () => props.cardId
)

const iconOffset = computed(() => variant.value === 'pill' ? '-right-11' : '-right-10')
</script>

<template>
  <UTooltip :text="copiedState === 'url' ? 'Link copied!' : 'Copy link'">
    <span
      class="group/copy relative inline-flex items-center select-none cursor-pointer transition-colors"
      :class="[
        variant === 'pill'
          ? 'card-id font-mono text-xs font-semibold text-dimmed bg-elevated px-1.5 py-0.5 rounded-md hover:text-toned'
          : plainClass,
        // The tooltip re-renders on state change, but a pointer already resting
        // on the element will not re-trigger it, so the copy is confirmed in
        // colour too. Colour costs no layout, so the row does not jump.
        copiedState === 'url' ? 'text-success!' : ''
      ]"
      @click.stop="copyUrl"
    >
      {{ formatTicketId(projectKey, cardId) }}
      <span
        v-if="showCopyButtons"
        class="absolute ml-1 inline-flex items-center gap-1 opacity-0 group-hover/copy:opacity-100 transition-opacity"
        :class="[iconOffset, { '!opacity-100': copiedState }]"
      >
        <UTooltip :text="copiedState === 'url' ? 'Copied!' : 'Copy link'">
          <button
            type="button"
            class="p-0.5 rounded-md hover:bg-elevated hover:text-primary transition-colors"
            :class="{ 'text-success!': copiedState === 'url' }"
            @click.stop="copyUrl"
          >
            <UIcon
              :name="copiedState === 'url' ? 'i-lucide-check' : 'i-lucide-link'"
              class="text-xs"
            />
          </button>
        </UTooltip>
        <UTooltip :text="copiedState === 'id' ? 'Copied!' : 'Copy ticket ID'">
          <button
            type="button"
            class="p-0.5 rounded-md hover:bg-elevated hover:text-primary transition-colors"
            :class="{ 'text-success!': copiedState === 'id' }"
            @click.stop="copyId"
          >
            <UIcon
              :name="copiedState === 'id' ? 'i-lucide-check' : 'i-lucide-file-type'"
              class="text-xs"
            />
          </button>
        </UTooltip>
      </span>
    </span>
  </UTooltip>
</template>
