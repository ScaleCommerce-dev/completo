<script setup lang="ts">
definePageMeta({ layout: 'default' })

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

function accentFor(project: { id: string, name: string }): string {
  return ACCENT_COLORS[hashCode(project.id || project.name) % ACCENT_COLORS.length]!
}

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
  <div class="p-6 max-w-5xl h-full overflow-y-auto">
    <!-- Header -->
    <div class="flex items-start justify-between mb-2">
      <div>
        <h1 class="text-xl font-extrabold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
          Projects
        </h1>
        <p class="text-[14px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Manage your project boards
        </p>
      </div>
      <NotificationBell />
    </div>

    <!-- Summary stats bar -->
    <div
      class="flex items-center gap-4 mb-6 mt-4 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60"
    >
      <div class="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
        <UIcon
          name="i-lucide-folder"
          class="text-[14px]"
        />
        <span>{{ totalProjects }} {{ totalProjects === 1 ? 'project' : 'projects' }}</span>
      </div>
      <div class="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700" />
      <div class="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
        <UIcon
          name="i-lucide-layout-dashboard"
          class="text-[14px]"
        />
        <span>{{ totalBoards }} {{ totalBoards === 1 ? 'board' : 'boards' }}</span>
      </div>
      <div class="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700" />
      <div class="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
        <UIcon
          name="i-lucide-layers"
          class="text-[14px]"
        />
        <span>{{ totalOpenCards }} open {{ totalOpenCards === 1 ? 'card' : 'cards' }}</span>
      </div>
    </div>

    <!-- Project cards grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <NuxtLink
        v-for="(project, index) in projects"
        :key="project.id"
        :to="`/projects/${project.slug}`"
        class="group block kanban-card-enter"
        :style="{ animationDelay: `${index * 40}ms` }"
      >
        <div
          class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 p-4 h-full hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5 transition-all"
          :style="{ borderLeftWidth: '3px', borderLeftColor: accentFor(project) }"
        >
          <!-- Top row: icon + name + key + settings -->
          <div class="flex items-start gap-3">
            <div
              class="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
            >
              <UIcon
                :name="`i-lucide-${project.icon || 'folder'}`"
                class="text-lg"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <h3 class="font-bold text-[14.5px] tracking-[-0.01em] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                  {{ project.name }}
                </h3>
                <span
                  class="font-mono text-[9px] font-bold px-1 py-0.5 rounded tracking-wide shrink-0"
                  :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
                >
                  {{ project.key }}
                </span>
              </div>
              <p class="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                {{ project.description || 'No description' }}
              </p>
            </div>
            <button
              v-if="project.role === 'owner' || project.role === 'admin'"
              class="opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all shrink-0"
              @click="openEditProject(project, $event)"
            >
              <UIcon
                name="i-lucide-settings"
                class="text-sm"
              />
            </button>
          </div>

          <!-- Stats row -->
          <div class="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-700/40 text-[12px] font-medium text-zinc-400 dark:text-zinc-500">
            <span class="flex items-center gap-1">
              <UIcon
                name="i-lucide-layers"
                class="text-[12px]"
              />
              {{ project.openCards || 0 }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon
                name="i-lucide-layout-dashboard"
                class="text-[12px]"
              />
              {{ project.boardCount || 0 }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon
                name="i-lucide-users"
                class="text-[12px]"
              />
              {{ project.memberCount || 0 }}
            </span>
            <template v-if="project.lastActivity">
              <span class="flex items-center gap-1">
                <UIcon
                  name="i-lucide-clock"
                  class="text-[12px]"
                />
                {{ relativeTime(project.lastActivity) }}
              </span>
            </template>

            <!-- Spacer + role badge + avatar stack -->
            <div class="ml-auto flex items-center gap-2">
              <span
                v-if="project.role !== 'admin'"
                class="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full"
                :class="project.role === 'owner'
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
              >
                {{ project.role }}
              </span>
              <div
                v-if="project.memberAvatars?.length"
                class="flex items-center -space-x-1.5"
              >
                <UAvatar
                  v-for="(m, mIdx) in project.memberAvatars"
                  :key="mIdx"
                  :src="m.avatarUrl || undefined"
                  :alt="m.name"
                  size="3xs"
                  class="ring-2 ring-white dark:ring-zinc-900"
                />
                <span
                  v-if="project.memberCount > 3"
                  class="flex items-center justify-center w-4 h-4 rounded-full bg-zinc-100 dark:bg-zinc-700 text-[8px] font-bold text-zinc-500 dark:text-zinc-400 ring-2 ring-white dark:ring-zinc-900"
                >
                  +{{ project.memberCount - 3 }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </NuxtLink>

      <!-- Ghost "+ New Project" card -->
      <NuxtLink
        to="/projects/new"
        class="group block"
      >
        <div class="rounded-xl border-2 border-dashed border-zinc-200/70 dark:border-zinc-600/50 p-4 h-full hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-all flex items-center">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 group-hover:text-indigo-500 transition-colors shrink-0">
              <UIcon
                name="i-lucide-plus"
                class="text-lg"
              />
            </div>
            <span class="text-[14px] font-medium text-zinc-400 dark:text-zinc-500 group-hover:text-indigo-500 transition-colors">
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
  </div>
</template>
