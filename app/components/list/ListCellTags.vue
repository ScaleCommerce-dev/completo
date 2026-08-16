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

/**
 * One, then a count.
 *
 * A 160px column cannot hold six filled pills, so it wrapped them onto three lines and
 * that one card doubled the height of every row around it. It can't hold two names
 * either — flex splits the space evenly and you get "BU… FEATU… +4", which is less
 * useful than no tags at all. One readable name plus a count is the honest fit; the
 * tooltip and the card have the rest. The board card is 304px wide and shows two.
 *
 * The tags are also quiet here (dot plus name, see TagPill): in a table the cell is one
 * signal among seven, not the content.
 */
const VISIBLE_TAGS = 1
const visibleTags = computed(() => props.cardTags.slice(0, VISIBLE_TAGS))
const hiddenTagCount = computed(() => Math.max(0, props.cardTags.length - VISIBLE_TAGS))
const allTagNames = computed(() => props.cardTags.map(t => t.name).join(', '))
</script>

<template>
  <!-- read-only -->
  <div
    v-if="readOnly || !tags?.length"
    class="flex gap-2 items-center min-h-cell min-w-0"
  >
    <TagPill
      v-for="tag in visibleTags"
      :key="tag.id"
      :name="tag.name"
      :color="tag.color"
      variant="quiet"
      class="min-w-0"
    />
    <span
      v-if="hiddenTagCount"
      class="text-2xs font-medium text-dimmed shrink-0"
    >+{{ hiddenTagCount }}</span>
    <span
      v-if="!cardTags.length"
      :class="EMPTY_CELL_CLASS"
    >&mdash;</span>
  </div>

  <!-- editable -->
  <TagMenu
    v-else
    :tags="tags || []"
    :selected-ids="cardTags.map(t => t.id)"
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', !!$event)"
    @toggle="emit('toggle', $event)"
  >
    <template #default="{ label }">
      <ListCellTrigger
        :label="label"
        class="gap-2 max-w-full min-w-0 text-left"
      >
        <TagPill
          v-for="tag in visibleTags"
          :key="tag.id"
          :name="tag.name"
          :color="tag.color"
          variant="quiet"
          class="min-w-0"
        />
        <UTooltip
          v-if="hiddenTagCount"
          :text="allTagNames"
        >
          <span class="text-2xs font-medium text-dimmed shrink-0">+{{ hiddenTagCount }}</span>
        </UTooltip>
        <span
          v-if="!cardTags.length"
          :class="EMPTY_CELL_CLASS"
        >&mdash;</span>
      </ListCellTrigger>
    </template>
  </TagMenu>
</template>
