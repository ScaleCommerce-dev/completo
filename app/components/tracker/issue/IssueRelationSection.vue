<script setup lang="ts">
/**
 * One of the sidebar's relation lists (Blocking, Blocked by, Related):
 * titles with their status glyph, the first four of a long
 * list with "Show n more", a remove control per row and an add control on the
 * heading.
 */
const props = defineProps<{
  label: string
  items: IssueRef[]
  /** Search prompt in the add menu. */
  placeholder: string
  /** The card's project, which the add menu suggests from. */
  projectId: string
  exclude: number[]
}>()

const emit = defineEmits<{
  add: [cardId: number]
  remove: [relationId: string]
}>()

/** Shows four and folds the rest once a list passes five. */
const FOLD_AFTER = 5
const expanded = ref(false)
const folded = computed(() => !expanded.value && props.items.length > FOLD_AFTER)
const shown = computed(() => (folded.value ? props.items.slice(0, FOLD_AFTER - 1) : props.items))
</script>

<template>
  <section>
    <div class="flex items-center justify-between min-h-7">
      <h3 class="text-sm font-medium text-muted">
        {{ label }}
      </h3>
      <TrackerIssuePicker
        :placeholder="placeholder"
        :project-id="projectId"
        :exclude="exclude"
        @select="emit('add', $event)"
      >
        <UButton
          icon="i-lucide-plus"
          size="xs"
          variant="ghost"
          color="neutral"
          :aria-label="`Add to ${label}`"
        />
      </TrackerIssuePicker>
    </div>

    <ul
      v-if="items.length"
      class="mt-1"
    >
      <li
        v-for="item in shown"
        :key="item.relationId ?? item.id"
        class="group flex items-center gap-1 -mx-2 px-2 h-8 rounded-md text-sm hover:bg-elevated transition-colors"
      >
        <TrackerIssueRefLink
          :issue="item"
          :show-id="!!item.hidden"
          class="flex-1"
        />
        <UButton
          v-if="item.relationId"
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="neutral"
          :aria-label="`Remove ${item.ticket ?? item.id} from ${label}`"
          class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-60"
          @click="emit('remove', item.relationId)"
        />
      </li>
    </ul>

    <button
      v-if="folded"
      type="button"
      class="flex items-center gap-2 h-8 text-sm text-muted hover:text-default transition-colors cursor-pointer"
      @click="expanded = true"
    >
      <UIcon
        name="i-lucide-chevrons-up-down"
        class="size-3.5"
      />
      Show {{ items.length - shown.length }} more
    </button>
  </section>
</template>
