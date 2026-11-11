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
  starred: boolean
  boardCount: number
  listCount: number
  totalCards: number
  openCards: number
  memberCount: number
  memberAvatars: Array<{ name: string, avatarUrl: string | null, kind?: 'human' | 'agent', color?: string | null }>
  lastActivity: string | null
}

const { data: projects, refresh } = await useFetch<ProjectListItem[]>('/api/projects')
const { refreshProjects } = useNavigation()

/**
 * Starred first, then the rest — each alphabetical, which is the API's order.
 *
 * The grouping is taken once per set of projects, not on every star: re-sorting
 * on the click would pull the card out from under the pointer and slide the grid
 * past it, and the next card you meant to star would no longer be where you were
 * looking. The order catches up on the next visit, or when a project is added or
 * removed — the moments the grid is being re-read anyway.
 */
const starredAtLoad = ref(new Set<string>())
watch(
  () => (projects.value || []).map(p => p.id).join(),
  () => { starredAtLoad.value = new Set((projects.value || []).filter(p => p.starred).map(p => p.id)) },
  { immediate: true }
)
const orderedProjects = computed(() => {
  const list = projects.value || []
  return [
    ...list.filter(p => starredAtLoad.value.has(p.id)),
    ...list.filter(p => !starredAtLoad.value.has(p.id))
  ]
})

/** The page's own copy of the flag; the sidebar's is patched by the button. */
function setRowStarred(projectId: string, starred: boolean) {
  if (!projects.value) return
  projects.value = projects.value.map(p => p.id === projectId ? { ...p, starred } : p)
}

// Edit project — the dialog is shared with the project page's Settings button.
const showEditProject = ref(false)
const editTarget = ref<ProjectListItem | null>(null)

function openEditProject(project: ProjectListItem, e?: Event) {
  e?.preventDefault()
  e?.stopPropagation()
  editTarget.value = project
  showEditProject.value = true
}

async function onProjectChanged() {
  await Promise.all([refresh(), refreshProjects()])
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
        v-for="(project, index) in orderedProjects"
        :key="project.id"
        class="group relative rise-in"
        :style="{ animationDelay: staggerDelay(index * 40) }"
      >
        <div class="lift relative overflow-hidden rounded-xl border border-default shadow-raise p-4 h-full group-hover:border-accented">
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
                <h3 class="font-bold text-base tracking-name truncate">
                  {{ project.name }}
                </h3>
                <!-- No project key here, deliberately. Its one job is to prefix
                     ticket ids, and it is printed wherever one appears (cards, the
                     panel, the list's ID column, ⌘K). It is not what the CLI takes
                     — that is the slug — and finding "SCC-2" needs no legend,
                     because ⌘K resolves a ticket id by its number. The key is set
                     and shown in the project's settings. -->
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
              One control spec for both, so the pair reads as one instrument:
              same button, same 16px glyph. Settings comes *first* so the star
              owns the card's right edge — settings is invisible at rest, and
              while it sat outside the star the star floated a button's width
              in from the edge and then had a neighbour appear beside it.

              `-mt-1 -mr-1.5` puts the glyph, not the button, where it
              belongs: centred on the name's line, and flush with the content
              edge the avatar stack below ends on. `relative z-10` lifts both
              above the card's link overlay.

              Settings shows on `group-focus-within` as well as hover, the way
              `EMPTY_CELL_CLASS` does it: a control revealed only on hover is
              one a keyboard can tab onto while it is still invisible. The star
              is visible at rest in both states, because whether a project is
              in your sidebar is what you scan this grid for — and members
              only, since an admin's non-member project has nothing to star.
            -->
            <div class="relative z-10 flex items-center gap-0.5 -mt-1 -mr-1.5 shrink-0">
              <UButton
                v-if="project.role === 'owner' || project.role === 'admin'"
                :aria-label="`Settings for ${project.name}`"
                icon="i-lucide-settings"
                variant="ghost"
                color="neutral"
                size="sm"
                square
                class="opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-60 text-dimmed hover:text-toned"
                :ui="{ leadingIcon: 'size-4' }"
                @click="openEditProject(project, $event)"
              />
              <ProjectStarButton
                v-if="project.role !== 'admin'"
                :project-id="project.id"
                :project-name="project.name"
                :starred="project.starred"
                @update:starred="setRowStarred(project.id, $event)"
              />
            </div>
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
                  :kind="m.kind"
                  :color="m.color"
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

    <ProjectSettingsDialog
      v-model:open="showEditProject"
      :project="editTarget"
      @saved="onProjectChanged"
      @deleted="onProjectChanged"
    />
  </UiPage>
</template>
