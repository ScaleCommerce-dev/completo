<script setup lang="ts">
import { CATEGORY_COLORS, type StatusCategory } from '#shared/utils/workflow'
import type { Member } from '~/types/card'
import type { FieldMenuOption } from '~/types/field-menu'
import { projectIcon } from '~/utils/issue-list'

/**
 * The tracker's "New issue": title, description and the properties in a row of
 * chips, in a centred dialog (`ui/Modal`). Opened from a list, there is no
 * board column for the card panel to reveal, so CLAUDE.md's "one overlay form
 * per object" puts it in the dialog; it is the tracker interface's create form,
 * as the panel is the standard one's. Creating commits once and Cancel
 * discards. The description starts with the workspace's issue template.
 */
const props = defineProps<{
  /** Preselected project, e.g. the project page the dialog was opened from. */
  defaultProjectId?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ created: [card: { id: number, projectId: string }] }>()

interface ProjectDetail { id: string, slug: string, statuses: Array<{ id: string, name: string, color: string | null, category: StatusCategory, position: number }> }

const { projects: navProjects } = useNavigation()
const { issueTemplate } = useWorkspaceSettings()
const projects = computed(() => [...(navProjects.value ?? [])].sort((a, b) => a.position - b.position))

const title = ref('')
const description = ref('')
const projectId = ref<string | null>(null)
const statusId = ref<string | null>(null)
const priority = ref<string | null>(null)
const assigneeId = ref<string | null>(null)
const creating = ref(false)
const error = ref('')
const detail = ref<ProjectDetail | null>(null)
const members = ref<Member[]>([])

const statuses = computed(() => [...(detail.value?.statuses ?? [])].sort((a, b) => a.position - b.position))
const status = computed(() => statuses.value.find(s => s.id === statusId.value))
const project = computed(() => projects.value.find(p => p.id === projectId.value))
const assignee = computed(() => members.value.find(m => m.id === assigneeId.value))

/** A new issue starts in the project's first open status (To Do); the first status if it has none. */
function firstStatusId(): string | null {
  return (statuses.value.find(s => s.category === 'unstarted') ?? statuses.value[0])?.id ?? null
}

watch(open, (isOpen) => {
  if (!isOpen) return
  title.value = ''
  priority.value = null
  assigneeId.value = null
  error.value = ''
  const next = props.defaultProjectId ?? projects.value[0]?.id ?? null
  // Reopened on the same project, the project watcher does not run again: a
  // project that failed to load last time is asked for again here.
  if (next && next === projectId.value && !detail.value) loadProject(next)
  projectId.value = next
  statusId.value = firstStatusId()
  description.value = issueTemplate.value
}, { immediate: true })

watch(projects, (ps) => {
  if (open.value && !projectId.value) projectId.value = props.defaultProjectId ?? ps[0]?.id ?? null
})

// A project brings its own statuses and members; what belonged to the last one goes.
async function loadProject(id: string | null) {
  detail.value = null
  members.value = []
  statusId.value = null
  if (!id) return
  try {
    const [d, m] = await Promise.all([
      $fetch<ProjectDetail>(`/api/projects/${id}`),
      $fetch<Member[]>(`/api/projects/${id}/members`)
    ])
    if (id !== projectId.value) return
    detail.value = d
    members.value = m
    statusId.value = firstStatusId()
    if (assigneeId.value && !m.some(x => x.id === assigneeId.value)) assigneeId.value = null
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Could not load the project')
  }
}
watch(projectId, loadProject, { immediate: true })

const projectOptions = computed<FieldMenuOption[]>(() => projects.value.map(p => ({
  label: p.name,
  checked: p.id === projectId.value,
  icon: projectIcon(p.icon),
  iconClass: 'text-dimmed',
  onSelect: () => { projectId.value = p.id }
})))

const statusOptions = computed<FieldMenuOption[]>(() => statuses.value.map(s => ({
  label: s.name,
  checked: s.id === statusId.value,
  status: { category: s.category, color: s.color ?? CATEGORY_COLORS[s.category] },
  onSelect: () => { statusId.value = s.id }
})))

// The tracker's order: no priority first, then urgent down to low.
const priorityOptions = computed<FieldMenuOption[]>(() => [
  { value: null as string | null, label: priorityLabel(null) },
  ...PRIORITIES.slice().reverse().map(p => ({ value: p.value as string | null, label: p.label }))
].map(p => ({
  label: p.label,
  checked: priority.value === p.value,
  priorityMark: { priority: p.value },
  onSelect: () => { priority.value = p.value }
})))

const canCreate = computed(() => !!title.value.trim() && !!projectId.value && !!statusId.value && !creating.value)

async function create() {
  if (!canCreate.value) return
  creating.value = true
  error.value = ''
  const target = project.value
  try {
    const card = await $fetch<{ id: number, projectId: string }>(`/api/projects/${projectId.value}/cards`, {
      method: 'POST',
      body: {
        title: title.value.trim(),
        description: description.value,
        statusId: statusId.value,
        priority: priority.value,
        assigneeId: assigneeId.value ?? undefined
      }
    })
    open.value = false
    const ticket = formatTicketId(target?.key, card.id)
    useToast().add({
      title: `${ticket} created`,
      description: title.value.trim(),
      color: 'success',
      actions: [{ label: 'View issue', to: `/projects/${detail.value?.slug ?? target?.slug}/cards/${ticket}` }]
    })
    emit('created', card)
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to create issue')
  } finally {
    creating.value = false
  }
}

/** ⌘↵ creates from anywhere in the dialog. */
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    create()
  }
}
</script>

<template>
  <UiModal
    v-model:open="open"
    icon="i-lucide-square-pen"
    title="New issue"
    size="xl"
  >
    <template #body>
      <div
        class="flex flex-col gap-3"
        @keydown="onKeydown"
      >
        <UInput
          v-model="title"
          placeholder="Issue title"
          aria-label="Issue title"
          size="xl"
          autofocus
          class="w-full"
          @keydown.enter.prevent="create"
        />
        <ProseEditor
          v-model="description"
          :title="title"
          :priority="priority ?? undefined"
          :project-slug="project?.slug"
          :project-key="project?.key"
          :members="members"
          :min-height="240"
          :max-height="480"
          placeholder="Add description..."
        />

        <div class="flex flex-wrap items-center gap-1.5">
          <FieldMenu
            label="Project"
            :options="projectOptions"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :icon="projectIcon(project?.icon)"
              :label="project?.name ?? 'Project'"
              :aria-label="`Project: ${project?.name ?? 'none'}`"
            />
          </FieldMenu>
          <FieldMenu
            label="Status"
            :options="statusOptions"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!statuses.length"
              :aria-label="`Status: ${status?.name ?? 'none'}`"
            >
              <TrackerStatusIcon
                :category="status?.category ?? 'backlog'"
                :color="status?.color"
              />
              {{ status?.name ?? 'Status' }}
            </UButton>
          </FieldMenu>
          <FieldMenu
            label="Priority"
            :options="priorityOptions"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :aria-label="`Priority: ${priorityLabel(priority)}`"
            >
              <TrackerPriorityIcon :priority="priority" />
              {{ priority ? priorityLabel(priority) : 'Priority' }}
            </UButton>
          </FieldMenu>
          <AssigneeMenu
            :members="members"
            :assignee-id="assigneeId"
            @select="assigneeId = $event"
          >
            <template #default="{ label }">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :aria-label="label"
              >
                <UiAvatar
                  v-if="assignee"
                  :src="assignee.avatarUrl"
                  :alt="assignee.name"
                  :kind="assignee.kind"
                  :color="assignee.color"
                  size="3xs"
                />
                <UIcon
                  v-else
                  name="i-lucide-circle-user-round"
                  class="size-3.5 text-muted"
                />
                {{ assignee?.name ?? 'Assignee' }}
              </UButton>
            </template>
          </AssigneeMenu>
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="error"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          label="Create issue"
          :loading="creating"
          :disabled="!canCreate"
          @click="create"
        />
      </div>
    </template>
  </UiModal>
</template>
