<script setup lang="ts">
const props = defineProps<{
  cardTags: Array<{ id: string, name: string, color: string }>
  tags?: Array<{ id: string, name: string, color: string }>
  readOnly?: boolean
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'toggle': [tagId: string]
  'update:popoverOpen': [open: boolean]
}>()

const label = computed(() =>
  props.cardTags.length
    ? `Tags: ${props.cardTags.map(t => t.name).join(', ')}. Change tags`
    : 'Add tags'
)
</script>

<template>
  <!-- read-only -->
  <div
    v-if="readOnly || !tags?.length"
    class="flex flex-wrap gap-1 items-center min-h-[22px]"
  >
    <TagPill
      v-for="tag in cardTags"
      :key="tag.id"
      :name="tag.name"
      :color="tag.color"
    />
    <span
      v-if="!cardTags.length"
      class="text-dimmed text-sm"
    >&mdash;</span>
  </div>

  <!-- editable -->
  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <button
      type="button"
      :aria-label="label"
      class="flex flex-wrap gap-1 items-center rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer min-h-[22px] max-w-full text-left"
      @click.stop
    >
      <TagPill
        v-for="tag in cardTags"
        :key="tag.id"
        :name="tag.name"
        :color="tag.color"
      />
      <!-- An em-dash, not the words "No tags". Ten rows of "No tags" down a
           column is noise about data that isn't there; the due-date column has
           always got this right. -->
      <span
        v-if="!cardTags.length"
        class="text-dimmed text-sm"
      >&mdash;</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="text-2xs shrink-0 text-dimmed opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </button>
    <template #content>
      <TagToggleList
        :tags="tags || []"
        :selected-ids="cardTags.map(t => t.id)"
        @toggle="emit('toggle', $event)"
      />
    </template>
  </UPopover>
</template>
