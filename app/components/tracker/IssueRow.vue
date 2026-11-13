<script setup lang="ts">
import { formatProjectDate, formatShortDate, issuePath, projectIcon, statusColor, type IssueRow } from '~/utils/issue-list'

/**
 * One line of the tracker's issue list, 40px: priority, ticket, status, title and
 * the sub-issue chip on the left; relation counts, project, due date, assignee
 * and the created date on the right. Chrome stays neutral; colour is spent on
 * the status, the high and urgent priorities and the relation counts, which
 * are data.
 */
withDefaults(defineProps<{
  issue: IssueRow
  depth?: number
  /** A parent shown above a sub-issue from another group: dimmed. */
  context?: boolean
  showProject?: boolean
}>(), {
  depth: 0,
  context: false,
  showProject: false
})

// One step per level; issues nest one level in practice.
const INDENT = ['pl-4', 'pl-10', 'pl-16']
</script>

<template>
  <NuxtLink
    :to="issuePath(issue)"
    class="group flex items-center gap-2.5 h-10 pr-4 text-sm hover:bg-elevated/50 transition-colors"
    :class="[INDENT[Math.min(depth, 2)], context ? 'opacity-60' : '']"
  >
    <span
      v-if="depth"
      class="self-stretch w-px bg-accented -ml-3 mr-1.5 shrink-0"
      aria-hidden="true"
    />
    <TrackerPriorityIcon :priority="issue.priority" />
    <span class="card-id min-w-16 shrink-0 text-xs text-muted max-sm:hidden">{{ issue.ticket }}</span>
    <TrackerStatusIcon
      :category="issue.status.category"
      :color="statusColor(issue.status)"
    />
    <span
      class="truncate min-w-0"
      :class="context ? 'text-muted' : 'text-highlighted'"
    >{{ issue.title }}</span>
    <span
      v-if="issue.childProgress"
      class="flex items-center gap-1 h-5 px-1.5 rounded-full border border-default text-xs text-muted tabular-nums shrink-0 max-sm:hidden"
      :title="`${issue.childProgress.completed} of ${issue.childProgress.total} sub-issues closed`"
    >
      <TrackerProgressRing
        :value="issue.childProgress.total ? issue.childProgress.completed / issue.childProgress.total : 0"
        :size="12"
      />
      {{ issue.childProgress.completed }}/{{ issue.childProgress.total }}
    </span>

    <span class="flex-1" />

    <span
      v-if="issue.blockedByCount > 0"
      class="flex items-center gap-1 h-5 px-1.5 rounded-full border border-default text-xs text-muted tabular-nums shrink-0"
      :title="`Blocked by ${issue.blockedByCount}`"
    >
      <UIcon
        name="i-lucide-circle-minus"
        class="size-3.5 text-error"
      />
      {{ issue.blockedByCount }}
    </span>
    <span
      v-if="issue.blockingCount > 0"
      class="flex items-center gap-1 h-5 px-1.5 rounded-full border border-default text-xs text-muted tabular-nums shrink-0 max-sm:hidden"
      :title="`Blocking ${issue.blockingCount}`"
    >
      <UIcon
        name="i-lucide-octagon-alert"
        class="size-3.5 text-warning"
      />
      {{ issue.blockingCount }}
    </span>
    <span
      v-if="showProject"
      class="flex items-center gap-1.5 h-6 px-2 rounded-full border border-default text-xs text-muted shrink-0 max-w-48 max-sm:hidden"
    >
      <UIcon
        :name="projectIcon(issue.project.icon)"
        class="size-3.5 swatch-text shrink-0"
        :style="{ '--swatch': accentFor(issue.project) }"
      />
      <span class="truncate">{{ issue.project.name }}</span>
    </span>
    <span
      v-if="issue.dueDate"
      class="flex items-center gap-1.5 h-6 px-2 rounded-full border border-default text-xs text-muted tabular-nums shrink-0 max-sm:hidden"
      title="Due date"
    >
      <UIcon
        name="i-lucide-calendar"
        class="size-3.5"
      />
      {{ formatProjectDate(issue.dueDate, 'day') }}
    </span>
    <UiAvatar
      v-if="issue.assignee"
      :src="issue.assignee.avatarUrl"
      :alt="issue.assignee.name"
      :kind="issue.assignee.kind"
      :color="issue.assignee.color"
      size="2xs"
      class="shrink-0"
    />
    <UIcon
      v-else
      name="i-lucide-circle-user-round"
      class="size-4 text-dimmed shrink-0"
      aria-label="No assignee"
    />
    <span class="w-14 text-right text-xs text-dimmed tabular-nums shrink-0 max-sm:hidden">{{ formatShortDate(issue.createdAt) }}</span>
  </NuxtLink>
</template>
