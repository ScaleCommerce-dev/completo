<script setup lang="ts">
import { PROJECT_STATES, progressOf, type DateResolution, type ProjectState } from '#shared/utils/workflow'
import type { FieldMenuOption } from '~/types/field-menu'
import type { MilestoneFields } from '~/components/tracker/MilestoneDialog.vue'
import { PROJECT_STATE_META, formatProjectDate, percent, type IssueRow } from '~/utils/issue-list'

/**
 * The right panel of the tracker's project page: properties edited in place,
 * milestones with their closed share, and progress by assignee. Every
 * property commits on choose (the commit contract for existing objects);
 * the page refetches the project after each change. Owners and admins edit,
 * as `PUT /api/projects/:id` allows; everyone reads. Members are shown, not
 * managed: that is the header's Members button, whose list this shares
 * (`useProjectMembers`), so a change there shows here.
 *
 * Milestone and progress numbers are computed from the issues the page
 * already holds, so they follow every change to that list.
 */
const props = defineProps<{
  project: {
    id: string
    leadId: string | null
    state: ProjectState
    priority: string | null
    startDate: string | null
    startDateResolution: DateResolution | null
    targetDate: string | null
    targetDateResolution: DateResolution | null
  }
  issues: IssueRow[]
  canEdit: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

interface Milestone extends MilestoneFields { position: number }
const { data: milestones, refresh: refreshMilestones } = useFetch<Milestone[]>(`/api/projects/${props.project.id}/milestones`, { default: () => [] })
const { data: membersData } = useProjectMembers(props.project.id)
const members = computed(() => membersData.value ?? [])

const lead = computed(() => members.value.find(m => m.id === props.project.leadId) ?? null)
const toast = useToast()

async function save(updates: Record<string, unknown>) {
  try {
    await $fetch(`/api/projects/${props.project.id}`, { method: 'PUT', body: updates })
    emit('changed')
  } catch (e: unknown) {
    toast.add({ title: 'Failed to update project', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
  }
}

// ─── Properties ─────────────────────────────────────────────────────────────

const stateOptions = computed<FieldMenuOption[]>(() => PROJECT_STATES.map(s => ({
  label: PROJECT_STATE_META[s].label,
  checked: props.project.state === s,
  status: { category: PROJECT_STATE_META[s].category, color: null },
  onSelect: () => save({ state: s })
})))

// The tracker's order: no priority first, then urgent down to low.
const priorityOptions = computed<FieldMenuOption[]>(() => [
  { value: null as string | null, label: 'No priority' },
  ...PRIORITIES.slice().reverse().map(p => ({ value: p.value as string | null, label: p.label }))
].map(p => ({
  label: p.label,
  checked: (props.project.priority ?? null) === p.value,
  priorityMark: { priority: p.value },
  onSelect: () => save({ priority: p.value })
})))

const leadOptions = computed<FieldMenuOption[]>(() => [
  { label: 'No lead', checked: !props.project.leadId, icon: 'i-lucide-user-x', iconClass: 'text-dimmed', onSelect: () => save({ leadId: null }) },
  // A lead is a person: agents work issues, they do not own a project.
  ...members.value.filter(m => m.kind !== 'agent').map(m => ({
    label: m.name,
    checked: m.id === props.project.leadId,
    avatar: { src: m.avatarUrl || undefined, alt: m.name, kind: m.kind, color: m.color },
    onSelect: () => save({ leadId: m.id })
  }))
])

function setDate(which: 'start' | 'target', date: string | null, resolution: DateResolution | null) {
  save(which === 'start'
    ? { startDate: date, startDateResolution: resolution }
    : { targetDate: date, targetDateResolution: resolution })
}

// ─── Milestones ─────────────────────────────────────────────────────────────

// The tracker's progress: canceled and duplicate issues leave the scope (`progressOf`).
const progress = (issues: IssueRow[]) => progressOf(issues.map(i => i.status.category))

const milestoneRows = computed(() => milestones.value.map((m) => {
  const { scope, completed } = progress(props.issues.filter(i => i.milestoneId === m.id))
  return { ...m, total: scope, completed }
}))
const withoutMilestone = computed(() => props.issues.filter(i => !i.milestoneId))

const milestoneDialog = ref(false)
const editingMilestoneId = ref<string | null>(null)
const editingMilestone = computed(() => milestones.value.find(m => m.id === editingMilestoneId.value) ?? null)
const deletingMilestone = ref<Milestone | null>(null)
const deleting = ref(false)

function openMilestone(id: string | null) {
  editingMilestoneId.value = id
  milestoneDialog.value = true
}

async function onMilestoneSaved() {
  await refreshMilestones()
  emit('changed')
}

async function confirmDeleteMilestone() {
  const m = deletingMilestone.value
  if (!m) return
  deleting.value = true
  try {
    await $fetch(`/api/milestones/${m.id}`, { method: 'DELETE' })
    deletingMilestone.value = null
    await refreshMilestones()
    emit('changed')
  } catch (e: unknown) {
    toast.add({ title: 'Failed to delete milestone', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
  } finally {
    deleting.value = false
  }
}

function milestoneMenu(m: Milestone) {
  return [[
    { label: 'Edit milestone', icon: 'i-lucide-pencil', onSelect: () => openMilestone(m.id) },
    { label: 'Delete milestone', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deletingMilestone.value = m } }
  ]]
}

function diamondClass(m: { total: number, completed: number }) {
  if (m.total && m.completed === m.total) return 'text-primary'
  return m.completed ? 'text-warning' : 'text-dimmed'
}

// ─── Progress ───────────────────────────────────────────────────────────────

const projectProgress = computed(() => progress(props.issues))
const started = computed(() => props.issues.filter(i => i.status.category === 'started').length)

const byAssignee = computed(() => {
  const rows = new Map<string, { key: string, person: IssueRow['assignee'], issues: IssueRow[] }>()
  for (const i of props.issues) {
    const key = i.assignee?.id ?? ''
    const row = rows.get(key) ?? { key, person: i.assignee, issues: [] }
    row.issues.push(i)
    rows.set(key, row)
  }
  return [...rows.values()]
    .map(({ issues, ...row }) => ({ ...row, total: progress(issues).scope, closed: progress(issues).completed }))
    .filter(row => row.total)
    .sort((a, b) => b.total - a.total)
})

/** One property row's value: a full-width button that opens its menu. */
const VALUE = 'flex items-center gap-2 min-w-0 w-full -mx-1.5 px-1.5 h-7 rounded-md text-left text-default enabled:hover:bg-elevated enabled:cursor-pointer transition-colors'
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <section class="rounded-lg border border-default bg-muted p-3">
      <h3 class="text-xs font-medium text-muted mb-2">
        Properties
      </h3>
      <dl class="panel-grid grid gap-y-1 items-center">
        <dt class="text-muted">
          Status
        </dt>
        <dd>
          <FieldMenu
            label="Status"
            :disabled="!canEdit"
            :options="stateOptions"
          >
            <button
              type="button"
              :class="VALUE"
              :disabled="!canEdit"
              :aria-label="`Status: ${PROJECT_STATE_META[project.state].label}`"
            >
              <TrackerStatusIcon :category="PROJECT_STATE_META[project.state].category" />
              {{ PROJECT_STATE_META[project.state].label }}
            </button>
          </FieldMenu>
        </dd>

        <dt class="text-muted">
          Priority
        </dt>
        <dd>
          <FieldMenu
            label="Priority"
            :disabled="!canEdit"
            :options="priorityOptions"
          >
            <button
              type="button"
              :class="VALUE"
              :disabled="!canEdit"
              :aria-label="`Priority: ${priorityLabel(project.priority)}`"
            >
              <TrackerPriorityIcon :priority="project.priority" />
              <span :class="project.priority ? '' : 'text-muted'">{{ priorityLabel(project.priority) }}</span>
            </button>
          </FieldMenu>
        </dd>

        <dt class="text-muted">
          Lead
        </dt>
        <dd>
          <FieldMenu
            label="Lead"
            :disabled="!canEdit"
            :options="leadOptions"
          >
            <button
              type="button"
              :class="VALUE"
              :disabled="!canEdit"
              :aria-label="`Lead: ${lead?.name ?? 'none'}`"
            >
              <UiAvatar
                v-if="lead"
                :src="lead.avatarUrl"
                :alt="lead.name"
                :kind="lead.kind"
                :color="lead.color"
                size="2xs"
              />
              <UIcon
                v-else
                name="i-lucide-circle-user-round"
                class="size-4 text-dimmed shrink-0"
              />
              <span
                class="truncate"
                :class="lead ? '' : 'text-muted'"
              >{{ lead?.name ?? 'Add lead' }}</span>
            </button>
          </FieldMenu>
        </dd>

        <dt class="text-muted">
          Members
        </dt>
        <dd
          class="flex items-center gap-2 h-7 min-w-0"
          :aria-label="`Members: ${members.length}`"
        >
          <span class="flex items-center -space-x-1">
            <span
              v-for="m in members.slice(0, 5)"
              :key="m.id"
              class="flex ring-2 ring-bg"
              :class="m.kind === 'agent' ? 'rounded-md' : 'rounded-full'"
            >
              <UiAvatar
                :src="m.avatarUrl"
                :alt="m.name"
                :kind="m.kind"
                :color="m.color"
                size="2xs"
              />
            </span>
          </span>
          <span class="tabular-nums text-default">{{ members.length }}</span>
        </dd>

        <dt class="text-muted">
          Dates
        </dt>
        <dd class="flex items-center gap-1 min-w-0">
          <TrackerProjectDatePicker
            label="Start date"
            :disabled="!canEdit"
            :date="project.startDate"
            :resolution="project.startDateResolution"
            @select="(d, r) => setDate('start', d, r)"
          >
            <button
              type="button"
              :class="VALUE"
              class="w-auto"
              :disabled="!canEdit"
              aria-label="Start date"
            >
              <UIcon
                name="i-lucide-calendar"
                class="size-3.5 text-muted"
              />
              <span :class="project.startDate ? '' : 'text-dimmed'">{{ formatProjectDate(project.startDate, project.startDateResolution) ?? 'Start' }}</span>
            </button>
          </TrackerProjectDatePicker>
          <UIcon
            name="i-lucide-arrow-right"
            class="size-3.5 text-dimmed shrink-0 mx-1"
          />
          <TrackerProjectDatePicker
            label="Target date"
            :disabled="!canEdit"
            :date="project.targetDate"
            :resolution="project.targetDateResolution"
            @select="(d, r) => setDate('target', d, r)"
          >
            <button
              type="button"
              :class="VALUE"
              class="w-auto"
              :disabled="!canEdit"
              aria-label="Target date"
            >
              <UIcon
                name="i-lucide-calendar-check"
                class="size-3.5 text-muted"
              />
              <span :class="project.targetDate ? '' : 'text-dimmed'">{{ formatProjectDate(project.targetDate, project.targetDateResolution) ?? 'Target' }}</span>
            </button>
          </TrackerProjectDatePicker>
        </dd>
      </dl>
    </section>

    <section class="rounded-lg border border-default bg-muted p-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-medium text-muted">
          Milestones
        </h3>
        <UButton
          v-if="canEdit"
          icon="i-lucide-plus"
          size="xs"
          variant="ghost"
          color="neutral"
          aria-label="Add milestone"
          @click="openMilestone(null)"
        />
      </div>
      <ul class="flex flex-col gap-0.5">
        <li
          v-for="m in milestoneRows"
          :key="m.id"
          class="group flex items-center gap-2 min-w-0 h-7"
        >
          <UIcon
            name="i-lucide-diamond"
            class="size-3.5 shrink-0"
            :class="diamondClass(m)"
          />
          <UTooltip
            :text="m.targetDate ? `Target ${formatProjectDate(m.targetDate, 'day')}` : 'No target date'"
            :disabled="!m.targetDate && !m.description"
          >
            <span class="truncate text-default">{{ m.name }}</span>
          </UTooltip>
          <span class="text-muted tabular-nums shrink-0">{{ percent(m.completed, m.total) }}% of {{ m.total }}</span>
          <UDropdownMenu
            v-if="canEdit"
            :items="milestoneMenu(m)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              size="xs"
              variant="ghost"
              color="neutral"
              class="ml-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-60"
              :aria-label="`Actions for ${m.name}`"
            />
          </UDropdownMenu>
        </li>
        <li
          v-if="withoutMilestone.length"
          class="flex items-center gap-2 h-7"
        >
          <UIcon
            name="i-lucide-diamond"
            class="size-3.5 text-dimmed shrink-0"
          />
          <span class="text-muted">No milestone</span>
          <span class="text-dimmed tabular-nums">{{ withoutMilestone.length }}</span>
        </li>
        <li
          v-if="!milestoneRows.length && !withoutMilestone.length"
          class="text-dimmed"
        >
          No milestones
        </li>
      </ul>
    </section>

    <section class="rounded-lg border border-default bg-muted p-3">
      <h3 class="text-xs font-medium text-muted mb-2">
        Progress
      </h3>
      <div class="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <span class="size-2 rounded-full bg-accented" />Scope
          </div>
          <div class="text-default tabular-nums">
            {{ projectProgress.scope }}
          </div>
        </div>
        <div>
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <span class="size-2 rounded-full bg-warning" />Started
          </div>
          <div class="text-default tabular-nums">
            {{ started }}
          </div>
        </div>
        <div>
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <span class="size-2 rounded-full bg-primary" />Completed
          </div>
          <div class="text-default tabular-nums">
            {{ projectProgress.completed }}
          </div>
        </div>
      </div>
      <h4 class="text-xs text-muted mb-1.5">
        Assignees
      </h4>
      <ul class="flex flex-col gap-2">
        <li
          v-for="row in byAssignee"
          :key="row.key"
          class="flex items-center gap-2 min-w-0"
        >
          <UiAvatar
            v-if="row.person"
            :src="row.person.avatarUrl"
            :alt="row.person.name"
            :kind="row.person.kind"
            :color="row.person.color"
            size="2xs"
          />
          <UIcon
            v-else
            name="i-lucide-circle-user-round"
            class="size-4 text-dimmed shrink-0"
          />
          <span class="flex-1 truncate text-default">{{ row.person?.name ?? 'No assignee' }}</span>
          <TrackerProgressRing :value="row.total ? row.closed / row.total : 0" />
          <span class="w-20 text-right text-muted tabular-nums shrink-0">{{ percent(row.closed, row.total) }}% of {{ row.total }}</span>
        </li>
      </ul>
    </section>

    <TrackerMilestoneDialog
      v-model:open="milestoneDialog"
      :project-id="project.id"
      :milestone="editingMilestone"
      @saved="onMilestoneSaved"
    />
    <UiConfirmDialog
      :open="!!deletingMilestone"
      :title="`Delete milestone ${deletingMilestone?.name ?? ''}?`"
      description="Its issues stay in the project and lose the milestone."
      action-label="Delete milestone"
      :loading="deleting"
      @update:open="v => { if (!v) deletingMilestone = null }"
      @confirm="confirmDeleteMilestone"
    />
  </div>
</template>

<style scoped>
.panel-grid { grid-template-columns: 5.5rem minmax(0, 1fr); }
</style>
