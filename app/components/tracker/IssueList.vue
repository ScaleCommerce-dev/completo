<script setup lang="ts">
import { CLOSED_CATEGORIES } from '#shared/utils/workflow'
import { groupIssues, type IssueEntry, type IssueGroup, type IssueOrdering, type IssueRow } from '~/utils/issue-list'

/**
 * The tracker's grouped issue list: one collapsible band per status with its
 * count, rows beneath (see `groupIssues` for order and nesting). Closed groups
 * start collapsed, because on a long-running project they are most of the rows
 * and none of the work.
 */
const props = withDefaults(defineProps<{
  issues: IssueRow[]
  showProject?: boolean
  loading?: boolean
  ordering?: IssueOrdering
  /** Rows can be dragged into a new order within their group and level. */
  reorderable?: boolean
}>(), {
  showProject: false,
  loading: false,
  ordering: 'priority',
  reorderable: false
})

const emit = defineEmits<{ reordered: [] }>()

const groups = computed(() => groupIssues(props.issues, props.ordering))

// Drag and drop: a row moves among its siblings, the rows of the same group at
// the same level under the same parent. Moving to another status stays the
// status menu's job.
const siblingKey = (group: IssueGroup, entry: IssueEntry) => `${group.key}/${entry.depth ? entry.issue.parentId : ''}`
const dragged = ref<{ entry: IssueEntry, key: string } | null>(null)
const target = ref<{ id: number, after: boolean } | null>(null)

function onDragStart(e: DragEvent, group: IssueGroup, entry: IssueEntry) {
  if (!props.reorderable || entry.context) return
  dragged.value = { entry, key: siblingKey(group, entry) }
  e.dataTransfer!.effectAllowed = 'move'
}
function onDragOver(e: DragEvent, group: IssueGroup, entry: IssueEntry) {
  const from = dragged.value
  if (!from || entry.context || entry.issue.id === from.entry.issue.id || siblingKey(group, entry) !== from.key) {
    target.value = null
    return
  }
  e.preventDefault()
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  target.value = { id: entry.issue.id, after: e.clientY > box.top + box.height / 2 }
}
async function onDrop(group: IssueGroup) {
  const from = dragged.value
  const to = target.value
  dragged.value = null
  target.value = null
  if (!from || !to) return
  // Dropping above a row means after the sibling before it, or first.
  const siblings = group.entries.filter(e => !e.context && siblingKey(group, e) === from.key && e.issue.id !== from.entry.issue.id)
  const at = siblings.findIndex(e => e.issue.id === to.id)
  const afterId = to.after ? to.id : siblings[at - 1]?.issue.id ?? null
  try {
    await $fetch(`/api/cards/${from.entry.issue.id}/move`, {
      method: 'PUT',
      body: { statusId: from.entry.issue.statusId, afterId }
    })
  } catch (e: unknown) {
    useToast().add({ title: 'Could not reorder the issue', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  }
  emit('reordered')
}
function onDragEnd() {
  dragged.value = null
  target.value = null
}

// Keyed by status name; a group not in the map follows its category's default.
const toggled = ref<Record<string, boolean>>({})
function isCollapsed(group: IssueGroup) {
  return toggled.value[group.key] ?? CLOSED_CATEGORIES.includes(group.category)
}
function toggle(group: IssueGroup) {
  toggled.value[group.key] = !isCollapsed(group)
}
</script>

<template>
  <!-- The root is the scroller (its parent passes the overflow); the list is
       inset by the page's gutter and framed on a card, as `ListView` frames its
       table, so groups and rows line up with the page header above, and it
       starts 30px below the toolbar (`page-body-start`), as `UiPage`'s own body.
       `overflow-clip`, not `hidden`: the sticky group headers must stick to the
       scroller, not to this wrapper. -->
  <div class="content-gutter-x content-gutter-bottom page-body-start">
    <div class="rounded-xl border border-default bg-default overflow-clip">
      <template v-if="loading && !issues.length">
        <USkeleton
          v-for="n in 8"
          :key="n"
          class="h-8 mx-4 my-1"
        />
      </template>
      <UEmpty
        v-else-if="!issues.length"
        icon="i-lucide-copy"
        title="No issues"
        description="Nothing matches this view."
        class="py-16"
      />
      <section
        v-for="group in groups"
        :key="group.key"
      >
        <button
          type="button"
          class="sticky top-0 z-10 flex items-center gap-2 w-full h-9 px-4 bg-muted border-b border-default text-sm text-left"
          :aria-expanded="!isCollapsed(group)"
          @click="toggle(group)"
        >
          <UIcon
            :name="isCollapsed(group) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
            class="size-3.5 text-dimmed"
          />
          <TrackerStatusIcon
            :category="group.category"
            :color="group.color"
          />
          <span class="font-medium text-highlighted">{{ group.key }}</span>
          <span class="text-muted tabular-nums">{{ group.count }}</span>
        </button>
        <template v-if="!isCollapsed(group)">
          <div
            v-for="entry in group.entries"
            :key="`${entry.issue.id}-${entry.context}`"
            class="relative"
            :class="dragged?.entry.issue.id === entry.issue.id ? 'opacity-40' : ''"
            @dragstart="onDragStart($event, group, entry)"
            @dragover="onDragOver($event, group, entry)"
            @drop.prevent="onDrop(group)"
            @dragend="onDragEnd"
          >
            <TrackerIssueRow
              :issue="entry.issue"
              :depth="entry.depth"
              :context="entry.context"
              :show-project="showProject"
            />
            <span
              v-if="target?.id === entry.issue.id && !entry.context"
              class="absolute inset-x-0 h-0.5 bg-primary pointer-events-none"
              :class="target.after ? 'bottom-0' : 'top-0'"
              aria-hidden="true"
            />
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
