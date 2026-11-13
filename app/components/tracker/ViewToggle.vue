<script setup lang="ts">
/**
 * List or Board for a project's issues. List is
 * the Issues tab; Board is the project's first board, upstream's board page
 * as it is (drag and drop, the card panel), not a second board. The choice is
 * remembered per project in this browser (`useProjectView`), so the project
 * opens the way it was left.
 */
const props = defineProps<{
  projectSlug: string
  current: 'list' | 'board'
  /** The board page this project's Board opens, or null when it has none. */
  boardPath: string | null
}>()

const view = useProjectView(props.projectSlug)
const route = useRoute()
const router = useRouter()

async function pick(next: 'list' | 'board') {
  view.value = next
  if (next === props.current) return
  if (next === 'board' && props.boardPath) {
    // The list's entry names its tab before the board is pushed: Back then
    // returns to the list, where the bare project address would open the
    // remembered board again.
    if (!route.query.tab) await router.replace({ query: { ...route.query, tab: 'issues' } })
    await navigateTo(props.boardPath)
  } else if (next === 'list') {
    await navigateTo(`/projects/${props.projectSlug}?tab=issues`)
  }
}

const SEGMENT = 'flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium transition-colors'
</script>

<template>
  <div
    class="flex items-center rounded-md border border-default overflow-hidden"
    role="radiogroup"
    aria-label="Show issues as"
  >
    <button
      type="button"
      role="radio"
      :aria-checked="current === 'list'"
      :class="[SEGMENT, current === 'list' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default hover:bg-elevated/50']"
      @click="pick('list')"
    >
      <UIcon
        name="i-lucide-list"
        class="size-3.5"
      />
      List
    </button>
    <UTooltip
      text="This project has no board yet"
      :disabled="!!boardPath"
    >
      <button
        type="button"
        role="radio"
        :aria-checked="current === 'board'"
        :disabled="!boardPath"
        :class="[SEGMENT, 'border-l border-default', current === 'board' ? 'bg-elevated text-highlighted' : 'text-muted enabled:hover:text-default enabled:hover:bg-elevated/50 disabled:opacity-50']"
        @click="pick('board')"
      >
        <UIcon
          name="i-lucide-layout-dashboard"
          class="size-3.5"
        />
        Board
      </button>
    </UTooltip>
  </div>
</template>
