<script setup lang="ts">
import type { DateResolution, ProjectState } from '#shared/utils/workflow'
import type { PersonRef } from '~/types/card'
import { PROJECT_STATE_META, formatProjectDate } from '~/utils/issue-list'

/**
 * The tracker's project activity: what happened to the project and to its issues,
 * newest first (`GET /api/projects/:id/activity`, the latest 100). One quiet
 * line per event, worded like the issue page's history.
 */
const props = defineProps<{ projectId: string }>()

interface FeedItem {
  id: string
  source: 'project' | 'card'
  type: string
  data: {
    from?: unknown
    to?: unknown
    fromResolution?: DateResolution | null
    toResolution?: DateResolution | null
    name?: string | null
    relation?: 'blocks' | 'blocked_by' | 'relates'
    cardIdRef?: IssueRef
  }
  createdAt: string
  actor: PersonRef | null
  card?: IssueRef
}

const { data: items, status, refresh } = useFetch<FeedItem[]>(() => `/api/projects/${props.projectId}/activity`, { default: () => [] })
defineExpose({ refresh })

const RELATION_WORDS = { blocks: 'blocking', blocked_by: 'blocked by', relates: 'related to' } as const
const text = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))
const stateLabel = (v: unknown) => PROJECT_STATE_META[v as ProjectState]?.label ?? text(v) ?? 'none'

/** A line as words and the issues it names, in reading order. */
type Part = string | IssueRef

function describe(e: FeedItem): Part[] {
  const { from, to } = e.data
  const date = (d: unknown, r?: DateResolution | null) => formatProjectDate(text(d), r ?? 'day')
  switch (e.type) {
    case 'name': return [`renamed the project to "${text(to) ?? ''}"`]
    case 'description': return ['updated the description']
    case 'state': return [`changed status from ${stateLabel(from)} to ${stateLabel(to)}`]
    case 'priority': return [to ? `set priority to ${priorityLabel(text(to))}` : 'removed the priority']
    case 'lead': return [to ? `set lead to ${text(to)}` : `removed ${text(from) ?? 'the'} as lead`]
    case 'start_date': return [to ? `set the start date to ${date(to, e.data.toResolution)}` : 'removed the start date']
    case 'target_date': return [to ? `set the target date to ${date(to, e.data.toResolution)}` : 'removed the target date']
    case 'member_added': return [`added ${e.data.name ?? 'someone'} to the project`]
    case 'member_removed': return [`removed ${e.data.name ?? 'someone'} from the project`]
    case 'milestone_added': return [`added milestone ${e.data.name ?? ''}`]
    case 'milestone_renamed': return [`renamed milestone ${text(from) ?? ''} to ${text(to) ?? ''}`]
    case 'milestone_removed': return [`removed milestone ${e.data.name ?? ''}`]
  }
  const card = e.card
  if (!card) return [`changed ${e.type}`]
  switch (e.type) {
    case 'created': return ['created', card]
    case 'status': return ['moved', card, `from ${text(from) ?? 'none'} to ${text(to) ?? 'none'}`]
    case 'relation_added':
      return ['marked', card, `as ${RELATION_WORDS[e.data.relation ?? 'relates']}`, ...(e.data.cardIdRef ? [e.data.cardIdRef] : [])]
    case 'relation_removed':
      return ['marked', card, `as no longer ${RELATION_WORDS[e.data.relation ?? 'relates']}`, ...(e.data.cardIdRef ? [e.data.cardIdRef] : [])]
    default: return [`changed ${e.type} of`, card]
  }
}

const ICONS: Record<string, string> = {
  state: 'i-lucide-circle-dot',
  priority: 'i-lucide-signal',
  start_date: 'i-lucide-calendar',
  target_date: 'i-lucide-calendar-check',
  member_added: 'i-lucide-user-plus',
  member_removed: 'i-lucide-user-minus',
  milestone_added: 'i-lucide-diamond',
  milestone_renamed: 'i-lucide-diamond',
  milestone_removed: 'i-lucide-diamond',
  relation_added: 'i-lucide-link',
  relation_removed: 'i-lucide-unlink'
}
</script>

<template>
  <section class="max-w-3xl">
    <h2 class="text-base font-medium text-highlighted mb-4">
      Activity
    </h2>
    <div
      v-if="status === 'pending' && !items.length"
      class="flex flex-col gap-3"
    >
      <USkeleton
        v-for="n in 6"
        :key="n"
        class="h-5 w-2/3"
      />
    </div>
    <UEmpty
      v-else-if="!items.length"
      icon="i-lucide-activity"
      title="No activity yet"
      description="Changes to the project and its issues show up here."
    />
    <ol
      v-else
      class="flex flex-col"
    >
      <li
        v-for="item in items"
        :key="`${item.source}${item.id}`"
        class="flex items-center gap-2.5 min-w-0 py-1.5 pl-1 text-sm text-muted"
      >
        <UIcon
          v-if="ICONS[item.type]"
          :name="ICONS[item.type]!"
          class="size-4 shrink-0 text-dimmed"
        />
        <UiAvatar
          v-else
          :src="item.actor?.avatarUrl"
          :alt="item.actor?.name ?? 'Someone'"
          :kind="item.actor?.kind"
          :color="item.actor?.color"
          size="3xs"
          class="shrink-0"
        />
        <span class="flex items-center gap-1 min-w-0">
          <span
            class="shrink-0 whitespace-nowrap text-toned"
          >{{ item.actor?.name ?? 'Someone' }}</span>
          <template
            v-for="(part, n) in describe(item)"
            :key="n"
          >
            <span
              v-if="typeof part === 'string'"
              class="shrink-0 whitespace-nowrap"
            >{{ part }}</span>
            <TrackerIssueRefLink
              v-else
              :issue="part"
              class="min-w-0"
            />
          </template>
          <UTooltip :text="formatTimestamp(item.createdAt)">
            <span class="shrink-0 whitespace-nowrap text-dimmed">&middot; {{ relativeTime(item.createdAt) }}</span>
          </UTooltip>
        </span>
      </li>
    </ol>
  </section>
</template>
