<script setup lang="ts">
definePageMeta({ layout: 'default' })
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
  boardCount: number
  listCount: number
  totalCards: number
  openCards: number
  memberCount: number
  memberAvatars: Array<{ name: string, avatarUrl: string | null }>
  lastActivity: string | null
}

const { data: projects, refresh } = await useFetch<ProjectListItem[]>('/api/projects')
const { refreshProjects } = useNavigation()

// Edit project
interface EditProjectData {
  id: string
  name: string
  key: string
  slug: string
  description: string | null
  briefing: string | null
  icon: string | null
  doneStatusId: string | null
  doneRetentionDays: number | null
}

const showEditProject = ref(false)
const editProjectData = ref<EditProjectData | undefined>(undefined)
const editStatuses = ref<Array<{ id: string, name: string, color: string | null }>>([])
const loadingStatuses = ref(false)
const editError = ref('')
const saving = ref(false)
const deleting = ref(false)

async function openEditProject(project: ProjectListItem, e?: Event) {
  e?.preventDefault()
  e?.stopPropagation()
  editError.value = ''
  saving.value = false
  deleting.value = false
  editProjectData.value = {
    id: project.id,
    name: project.name,
    key: project.key || '',
    slug: project.slug || '',
    description: project.description || null,
    briefing: project.briefing || null,
    icon: project.icon || null,
    doneStatusId: project.doneStatusId || null,
    doneRetentionDays: project.doneRetentionDays ?? null
  }
  editStatuses.value = []
  loadingStatuses.value = true
  showEditProject.value = true

  // Fetch project detail for statuses + latest briefing/done config
  try {
    const detail = await $fetch(`/api/projects/${project.id}`) as { statuses?: Array<{ id: string, name: string, color: string | null }>, doneStatusId?: string | null, doneRetentionDays?: number | null, briefing?: string | null }
    editStatuses.value = detail.statuses || []
    editProjectData.value = {
      ...editProjectData.value!,
      doneStatusId: detail.doneStatusId || null,
      doneRetentionDays: detail.doneRetentionDays ?? null,
      briefing: detail.briefing || null
    }
  } catch {
    // ignore — statuses selector will be empty
  } finally {
    loadingStatuses.value = false
  }
}

// Open edit modal via ?edit=projectId query param (from project detail settings icon)
const route = useRoute()
onMounted(() => {
  const editParam = route.query.edit as string
  if (editParam && projects.value) {
    const project = projects.value.find(p => p.id === editParam)
    if (project) openEditProject(project)
  }
})

async function saveProject(data: Record<string, unknown>) {
  if (!editProjectData.value?.id) return
  saving.value = true
  editError.value = ''
  try {
    await $fetch(`/api/projects/${editProjectData.value.id}` as string, {
      method: 'PUT' as const,
      body: data
    })
    showEditProject.value = false
    await Promise.all([refresh(), refreshProjects()])
    // If opened via ?edit= param (e.g. from project detail), navigate back
    if (route.query.edit) {
      await navigateTo(`/projects/${data.slug as string}`)
    }
  } catch (e: unknown) {
    editError.value = getErrorMessage(e, 'Failed to update project')
  } finally {
    saving.value = false
  }
}

async function deleteProject() {
  if (!editProjectData.value?.id) return
  deleting.value = true
  try {
    await $fetch(`/api/projects/${editProjectData.value.id}` as string, { method: 'DELETE' as const })
    showEditProject.value = false
    await Promise.all([refresh(), refreshProjects()])
  } catch (e: unknown) {
    editError.value = getErrorMessage(e, 'Failed to delete project')
  } finally {
    deleting.value = false
  }
}

// Summary stats
const totalProjects = computed(() => projects.value?.length || 0)
const totalOpenCards = computed(() => projects.value?.reduce((sum, p) => sum + (p.openCards || 0), 0) || 0)
const totalBoards = computed(() => projects.value?.reduce((sum, p) => sum + (p.boardCount || 0), 0) || 0)
</script>

<template>
  <UiPage
    title="Projects"
    description="Every project you can see"
    width="wide"
  >
    <template #actions>
      <UButton
        label="New project"
        icon="i-lucide-plus"
        to="/projects/new"
      />
    </template>

    <!-- Summary stats bar -->
    <div
      class="flex items-center gap-4 mb-6 mt-4 px-3 py-2 rounded-lg bg-muted border border-muted"
    >
      <div class="flex items-center gap-1.5 text-sm font-medium text-muted">
        <UIcon
          name="i-lucide-folder"
          class="text-base"
        />
        <span>{{ totalProjects }} {{ totalProjects === 1 ? 'project' : 'projects' }}</span>
      </div>
      <div class="w-px h-3.5 bg-accented" />
      <div class="flex items-center gap-1.5 text-sm font-medium text-muted">
        <UIcon
          name="i-lucide-layout-dashboard"
          class="text-base"
        />
        <span>{{ totalBoards }} {{ totalBoards === 1 ? 'board' : 'boards' }}</span>
      </div>
      <div class="w-px h-3.5 bg-accented" />
      <div class="flex items-center gap-1.5 text-sm font-medium text-muted">
        <UIcon
          name="i-lucide-layers"
          class="text-base"
        />
        <span>{{ totalOpenCards }} open {{ totalOpenCards === 1 ? 'card' : 'cards' }}</span>
      </div>
    </div>

    <!-- Project cards grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <!--
        The settings button is a sibling of the link, not a child of it.
        A `<button>` inside an `<a>` is invalid HTML and screen readers flatten
        it unpredictably — and there is no valid way to nest them, so the link
        becomes a stretched overlay instead and the button sits above it. Layout
        is unchanged: the overlay covers the card, so the card's own hover states
        move to `group-hover`.
      -->
      <div
        v-for="(project, index) in projects"
        :key="project.id"
        class="group relative rise-in"
        :style="{ animationDelay: staggerDelay(index * 40) }"
      >
        <div class="relative overflow-hidden rounded-xl border border-default p-4 h-full group-hover:border-primary/60 group-hover:shadow-float transition-colors">
          <UiAccentBar :color="accentFor(project)" />
          <!-- Top row: icon + name + key + settings -->
          <div class="flex items-start gap-3">
            <div
              class="swatch flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              :style="{ '--swatch': accentFor(project) }"
            >
              <UIcon
                :name="`i-lucide-${project.icon || 'folder'}`"
                class="text-lg"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <h3 class="font-bold text-base tracking-name group-hover:text-primary transition-colors truncate">
                  {{ project.name }}
                </h3>
                <!-- The key is for the CLI, ticket IDs and URLs — the same judgment as
                     TK-27 on a board card. As a filled chip in the project's own accent
                     it competed with the name it sits beside. -->
                <span class="font-mono text-2xs font-medium text-dimmed tracking-wide shrink-0">
                  {{ project.key }}
                </span>
              </div>
              <!-- No "No description". A vacant sentence in the slot where a real one
                   would go is worse than the gap it fills. -->
              <p
                v-if="project.description"
                class="text-sm text-muted mt-0.5 line-clamp-2 leading-relaxed"
              >
                {{ project.description }}
              </p>
            </div>
            <!--
              `group-focus-within` alongside `group-hover`, the way
              `EMPTY_CELL_CLASS` already does it: a control revealed only on
              hover is a control a keyboard can tab onto while it is still
              invisible. `relative z-10` lifts it above the link overlay below.
            -->
            <button
              v-if="project.role === 'owner' || project.role === 'admin'"
              :aria-label="`Settings for ${project.name}`"
              class="relative z-10 opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-60 p-1 rounded-md text-dimmed hover:text-toned hover:bg-elevated transition shrink-0"
              @click="openEditProject(project, $event)"
            >
              <UIcon
                name="i-lucide-settings"
                class="text-sm"
              />
            </button>
          </div>

          <!-- Stats row -->
          <!-- Counted things say what they are. This row read "12  1  6  34m ago" behind
               four icons: four numbers, and nothing to tell you which was cards and which
               was people. Two counts fit in words where four did not, and the board count
               is the one nobody was reading — the hub lists the boards themselves. The
               whole run truncates rather than wrapping: at three cards across it would
               otherwise break into a ragged block of single words. -->
          <div class="flex items-center gap-2 mt-3 pt-3 border-t border-muted text-xs font-medium text-dimmed">
            <span class="truncate">
              {{ pluralize(project.openCards || 0, 'card') }}
              &middot;
              {{ pluralize(project.memberCount || 0, 'person', 'people') }}
              <template v-if="project.lastActivity">
                &middot; {{ relativeTime(project.lastActivity) }}
              </template>
            </span>

            <!-- Spacer + role badge + avatar stack -->
            <div class="ml-auto flex items-center gap-2 shrink-0">
              <span
                v-if="project.role !== 'admin'"
                class="text-2xs font-bold uppercase tracking-label px-1.5 py-0.5 rounded-full"
                :class="project.role === 'owner'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-elevated text-muted'"
              >
                {{ project.role }}
              </span>
              <div
                v-if="project.memberAvatars?.length"
                class="flex items-center -space-x-1.5"
              >
                <UiAvatar
                  v-for="(m, mIdx) in project.memberAvatars"
                  :key="mIdx"
                  :src="m.avatarUrl || undefined"
                  :alt="m.name"
                  size="3xs"
                  class="ring-2 ring-bg"
                />
                <span
                  v-if="project.memberCount > 3"
                  class="flex items-center justify-center w-4 h-4 rounded-full bg-elevated text-2xs font-bold text-muted ring-2 ring-bg"
                >
                  +{{ project.memberCount - 3 }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- The card's link. Last so it sits under the settings button, and
             named explicitly because a stretched overlay has no text of its
             own — without this it would announce as an unnamed link. -->
        <NuxtLink
          :to="`/projects/${project.slug}`"
          class="absolute inset-0 rounded-xl"
          :aria-label="project.name"
        />
      </div>

      <!-- Ghost "+ New Project" card -->
      <NuxtLink
        to="/projects/new"
        class="group block"
      >
        <div class="rounded-xl border-2 border-dashed border-accented p-4 h-full hover:border-primary hover:bg-primary/5 transition-colors flex items-center">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-elevated text-dimmed group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
              <UIcon
                name="i-lucide-plus"
                class="text-lg"
              />
            </div>
            <span class="text-base font-medium text-dimmed group-hover:text-primary transition-colors">
              New Project
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Edit Project Modal -->
    <UModal v-model:open="showEditProject">
      <template #content>
        <ProjectForm
          mode="edit"
          :initial-data="editProjectData"
          :statuses="editStatuses"
          :loading-statuses="loadingStatuses"
          :loading="saving"
          :deleting="deleting"
          :error="editError"
          @submit="saveProject"
          @cancel="showEditProject = false"
          @delete="deleteProject"
        />
      </template>
    </UModal>
  </UiPage>
</template>
