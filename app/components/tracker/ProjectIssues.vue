<script setup lang="ts">
import type { DateResolution, ProjectState } from '#shared/utils/workflow'
import type { IssueOrdering, IssueRow } from '~/utils/issue-list'

/**
 * A project's Issues tab in the tracker interface: the grouped list, in manual
 * order (dragged) or by priority, with the project panel on the right. The
 * page owns the toolbar that drives `ordering` and `panelOpen`.
 */
const props = defineProps<{
  project: {
    id: string
    role: string
    leadId: string | null
    state: ProjectState
    priority: string | null
    startDate: string | null
    startDateResolution: DateResolution | null
    targetDate: string | null
    targetDateResolution: DateResolution | null
  }
  ordering: IssueOrdering
  panelOpen: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

const { data: issues, status, refresh } = useFetch<IssueRow[]>('/api/issues', {
  query: { view: 'all', projectId: props.project.id },
  default: () => []
})
defineExpose({ refresh })

/**
 * A panel edit can change what the rows carry: deleting a milestone clears it
 * on every issue in it, and renaming one renames their milestone. So the list
 * reloads alongside the project.
 */
function onPanelChanged() {
  refresh()
  emit('changed')
}

const canEdit = computed(() => props.project.role === 'owner' || props.project.role === 'admin')
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <TrackerIssueList
      :issues="issues"
      :loading="status === 'pending'"
      :ordering="ordering"
      :reorderable="ordering === 'manual'"
      class="flex-1 min-w-0 overflow-y-auto thin-scroll"
      @reordered="refresh()"
    />
    <aside
      v-if="panelOpen"
      class="w-88 shrink-0 overflow-y-auto thin-scroll border-l border-default px-3 pb-3 page-body-start max-lg:hidden"
    >
      <TrackerProjectPanel
        :project="project"
        :issues="issues"
        :can-edit="canEdit"
        @changed="onPanelChanged"
      />
    </aside>
  </div>
</template>
