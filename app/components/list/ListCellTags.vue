<script setup lang="ts">
defineProps<{
  cardTags: Array<{ id: string, name: string, color: string }>
  tags?: Array<{ id: string, name: string, color: string }>
  readOnly?: boolean
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'toggle': [tagId: string]
  'update:popoverOpen': [open: boolean]
}>()
</script>

<template>
  <!-- read-only -->
  <div
    v-if="readOnly || !tags?.length"
    class="flex flex-wrap gap-1"
  >
    <TagPill
      v-for="tag in cardTags"
      :key="tag.id"
      :name="tag.name"
      :color="tag.color"
    />
  </div>

  <!-- editable -->
  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <div
      class="flex flex-wrap gap-1 items-center rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer min-h-[22px]"
      @click.stop
    >
      <template v-if="cardTags.length">
        <TagPill
          v-for="tag in cardTags"
          :key="tag.id"
          :name="tag.name"
          :color="tag.color"
        />
      </template>
      <span
        v-else
        class="text-zinc-300 dark:text-zinc-600 text-[13px]"
      >No tags</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </div>
    <template #content>
      <TagToggleList
        class="list-popover-menu"
        :tags="tags || []"
        :selected-ids="cardTags.map(t => t.id)"
        @toggle="emit('toggle', $event)"
      />
    </template>
  </UPopover>
</template>
