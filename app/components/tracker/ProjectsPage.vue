<script setup lang="ts">
import type { DateResolution } from '#shared/utils/workflow'
import type { PersonRef } from '~/types/card'
import { formatProjectDate, percent, projectIcon } from '~/utils/issue-list'

/**
 * All projects as the tracker's projects table: name with the current milestone,
 * lead, target date, issue count and progress, one line each, in the
 * workspace's manual order. Instance admins drag rows into that order (PUT
 * /api/projects/reorder); the sidebar's favorites follow it.
 *
 * Health is left out: it is drawn from project updates, which Completo does
 * not have. The star and the settings button are the standard grid's, so a
 * project gets into the sidebar and into its settings the same way in both
 * interfaces.
 */
useSeoMeta({ title: 'Projects · Completo' })

interface ProjectListItem {
  id: string
  name: string
  slug: string
  key: string
  description: string | null
  briefing: string | null
  icon: string | null
  doneStatusId: string | null
  doneRetentionDays: number | null
  role: string
  starred: boolean
  position: number
  totalCards: number
  scopeCards: number
  completedCards: number
  lead: PersonRef | null
  currentMilestone: { id: string, name: string } | null
  targetDate: string | null
  targetDateResolution: DateResolution | null
}

const draggable = defineAsyncComponent(() => import('vuedraggable'))

const { data: projects, refresh } = await useFetch<ProjectListItem[]>('/api/projects')
const { refreshProjects } = useNavigation()
const { user } = useUserSession()

/** Owners, and every admin: the same rule as the standard grid's settings button. */
function canEditProject(project: ProjectListItem) {
  return !!user.value?.isAdmin || project.role === 'owner'
}

/** One order for the workspace, so only instance admins drag. */
const canReorder = computed(() => !!user.value?.isAdmin)
const ordered = ref<ProjectListItem[]>([])
watch(projects, (rows) => {
  ordered.value = [...(rows ?? [])].sort((a, b) => a.position - b.position)
}, { immediate: true })

async function saveOrder(e: { oldIndex?: number, newIndex?: number }) {
  if (e.oldIndex === e.newIndex) return
  try {
    await $fetch('/api/projects/reorder', { method: 'PUT', body: { projectIds: ordered.value.map(p => p.id) } })
  } catch (err: unknown) {
    useToast().add({ title: 'Could not reorder projects', description: getErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  await Promise.all([refresh(), refreshProjects()])
}

/** The target date right in the table; owners and admins only. */
async function setTargetDate(project: ProjectListItem, targetDate: string | null, targetDateResolution: DateResolution | null) {
  try {
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', body: { targetDate, targetDateResolution } })
    await refresh()
  } catch (e: unknown) {
    useToast().add({ title: 'Could not set the target date', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  }
}

/** The page's own copy of the flag; the sidebar's is patched by the button. */
function setRowStarred(projectId: string, starred: boolean) {
  if (!projects.value) return
  projects.value = projects.value.map(p => p.id === projectId ? { ...p, starred } : p)
}

const showEditProject = ref(false)
const editTarget = ref<ProjectListItem | null>(null)

function openEditProject(project: ProjectListItem) {
  editTarget.value = project
  showEditProject.value = true
}

async function onProjectChanged() {
  await Promise.all([refresh(), refreshProjects()])
}
</script>

<template>
  <UiPage
    title="Projects"
    variant="surface"
  >
    <template #actions>
      <UButton
        label="New project"
        icon="i-lucide-plus"
        to="/projects/new"
      />
    </template>

    <!-- Inset by the page's gutter and framed on a card, as `ListView` frames
         its table: the rows line up with the page header above, and a list on
         the canvas sits on a surface. `overflow-clip`, not `hidden`, so the
         wrapper does not become a second scroller. -->
    <div class="flex-1 min-h-0 overflow-y-auto thin-scroll text-sm content-gutter-x content-gutter-bottom">
      <div class="rounded-xl border border-default bg-default overflow-clip">
        <!-- One grid template for the header and every row, so the columns line up. -->
        <div class="projects-grid grid items-center gap-3 sm:gap-4 h-9 px-4 border-b border-default text-xs text-muted">
          <span>Name</span>
          <span class="max-sm:hidden">Lead</span>
          <span class="max-sm:hidden">Target date</span>
          <span class="text-right max-sm:hidden">Issues</span>
          <span>Progress</span>
          <span />
        </div>

        <UEmpty
          v-if="projects && !projects.length"
          class="c2s-empty-brand py-16"
          icon="i-lucide-box"
          title="No projects yet"
          description="Projects you belong to show up here."
          :actions="[{ label: 'New project', icon: 'i-lucide-plus', to: '/projects/new' }]"
        />

        <!-- The buttons are siblings of the link, not children: a button inside an
           anchor is invalid, so the link is a stretched layer under the row and
           the buttons sit above it. Sortable leaves links undraggable on its
           own (`ignore: 'a, img'`), so the whole row is the drag handle without
           hijacking the link. -->
        <draggable
          v-model="ordered"
          item-key="id"
          :disabled="!canReorder"
          ghost-class="sortable-ghost"
          chosen-class="sortable-chosen"
          @end="saveOrder"
        >
          <template #item="{ element: project }">
            <div
              class="group relative projects-grid grid items-center gap-3 sm:gap-4 h-11 px-4 border-b border-default last:border-b-0 hover:bg-elevated/50 transition-colors"
              :class="canReorder ? 'cursor-grab active:cursor-grabbing' : ''"
            >
              <NuxtLink
                :to="`/projects/${project.slug}`"
                class="absolute inset-0"
                :aria-label="project.name"
              />
              <span class="flex items-center gap-2.5 min-w-0">
                <UIcon
                  :name="projectIcon(project.icon)"
                  class="size-4 shrink-0 swatch-text"
                  :style="{ '--swatch': accentFor(project) }"
                />
                <span class="font-medium text-highlighted truncate">{{ project.name }}</span>
                <span
                  v-if="project.currentMilestone"
                  class="flex items-center gap-1 text-xs text-muted min-w-0 max-sm:hidden"
                >
                  <UIcon
                    name="i-lucide-diamond"
                    class="size-3.5 text-warning shrink-0"
                  />
                  <span class="truncate">{{ project.currentMilestone.name }}</span>
                </span>
              </span>
              <span class="flex items-center gap-2 min-w-0 text-default max-sm:hidden">
                <template v-if="project.lead">
                  <UiAvatar
                    :src="project.lead.avatarUrl"
                    :alt="project.lead.name"
                    :kind="project.lead.kind"
                    :color="project.lead.color"
                    size="2xs"
                  />
                  <span class="truncate">{{ project.lead.name }}</span>
                </template>
              </span>
              <span class="flex items-center min-w-0 text-default max-sm:hidden">
                <TrackerProjectDatePicker
                  v-if="canEditProject(project)"
                  label="Target date"
                  :date="project.targetDate"
                  :resolution="project.targetDateResolution"
                  @select="(d: string | null, r: DateResolution | null) => setTargetDate(project, d, r)"
                >
                  <button
                    type="button"
                    class="relative flex items-center gap-1.5 -mx-1.5 px-1.5 h-7 rounded-md hover:bg-elevated transition"
                    :class="project.targetDate ? '' : 'text-dimmed opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
                    :aria-label="`Target date of ${project.name}`"
                  >
                    <UIcon
                      name="i-lucide-calendar"
                      class="size-3.5 text-muted"
                    />
                    {{ formatProjectDate(project.targetDate, project.targetDateResolution) ?? 'Set date' }}
                  </button>
                </TrackerProjectDatePicker>
                <span
                  v-else-if="project.targetDate"
                  class="flex items-center gap-1.5"
                >
                  <UIcon
                    name="i-lucide-calendar"
                    class="size-3.5 text-muted"
                  />
                  {{ formatProjectDate(project.targetDate, project.targetDateResolution) }}
                </span>
              </span>
              <span class="text-right tabular-nums text-default max-sm:hidden">{{ project.totalCards }}</span>
              <span class="flex items-center gap-1.5 tabular-nums text-default">
                <TrackerProgressRing :value="project.scopeCards ? project.completedCards / project.scopeCards : 0" />
                {{ percent(project.completedCards, project.scopeCards) }}%
              </span>
              <span class="relative flex items-center justify-end gap-0.5">
                <UTooltip
                  v-if="canEditProject(project)"
                  text="Project settings"
                >
                  <UButton
                    :aria-label="`Settings for ${project.name}`"
                    icon="i-lucide-settings"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    square
                    class="opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-60 text-dimmed hover:text-toned"
                    @click="openEditProject(project)"
                  />
                </UTooltip>
                <ProjectStarButton
                  v-if="project.role !== 'admin'"
                  :project-id="project.id"
                  :project-name="project.name"
                  :starred="project.starred"
                  @update:starred="setRowStarred(project.id, $event)"
                />
              </span>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <ProjectSettingsDialog
      v-model:open="showEditProject"
      :project="editTarget"
      @saved="onProjectChanged"
      @deleted="onProjectChanged"
    />
  </UiPage>
</template>

<style scoped>
/* Name takes the slack; the rest are fixed column widths. */
.projects-grid { grid-template-columns: minmax(0, 1fr) 12rem 8rem 4rem 6rem 4.5rem; }
/* Phones: Lead, Target date and the issue count step out (max-sm:hidden
   above), so the name keeps about half of a 375px screen beside progress and
   the star and settings buttons. Same breakpoint as Tailwind's sm. */
@media (width < 40rem) {
  .projects-grid { grid-template-columns: minmax(0, 1fr) 4.5rem 4.5rem; }
}
</style>
