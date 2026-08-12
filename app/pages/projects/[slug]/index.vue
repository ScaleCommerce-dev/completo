<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const slug = route.params.slug as string

interface ProjectDetail {
  id: string
  name: string
  slug: string
  key: string
  description: string | null
  icon: string | null
  doneStatusId: string | null
  role: string
  openCards: number
  statuses: Array<{ id: string, name: string, color: string | null }>
  tags: Array<{ id: string, name: string, color: string }>
  boards: Array<{ id: string, name: string, slug: string, position: number, cardCount: number, lastActivity: string | null, createdBy: { id: string, name: string } | null }>
  lists: Array<{ id: string, name: string, slug: string, position: number, cardCount: number, lastActivity: string | null, createdBy: { id: string, name: string } | null }>
}
const toast = useToast()
const { data: project, error: fetchError, refresh } = await useFetch<ProjectDetail>(`/api/projects/${slug}`)
if (fetchError.value) {
  showError(fetchError.value)
}

// Permissions
const { user } = useUserSession()
const isOwnerOrAdmin = computed(() => project.value?.role === 'owner' || project.value?.role === 'admin')

// Derived data
const projectStatuses = computed(() => project.value?.statuses || [])
const projectTags = computed(() => project.value?.tags || [])

// Combined views: boards + lists sorted by position
const allViews = computed(() => {
  const boards = (project.value?.boards || []).map(b => ({ ...b, _type: 'board' as const }))
  const lists = (project.value?.lists || []).map(l => ({ ...l, _type: 'list' as const }))
  return [...boards, ...lists].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
})

function canDeleteView(view: { createdBy?: { id: string } | null }): boolean {
  if (isOwnerOrAdmin.value) return true
  if (view.createdBy?.id === user.value?.id) return true
  return false
}

// Create view modal
const showNewView = ref(false)

async function onViewCreated(view: { type: 'board' | 'list', slug: string }) {
  await navigateTo(`/projects/${slug}/${view.type === 'board' ? 'boards' : 'lists'}/${view.slug}`)
}

// Delete view (board or list)
const showDeleteView = ref(false)
const deleteViewTarget = ref<{ id: string, name: string } | null>(null)
const deleteViewType = ref<'board' | 'list'>('board')
const deleteViewConfirmName = ref('')
const deletingView = ref(false)

const deleteViewConfirmValid = computed(() =>
  deleteViewConfirmName.value.trim() === (deleteViewTarget.value?.name || '').trim()
)

function openDeleteView(view: { id: string, name: string }, type: 'board' | 'list', e: Event) {
  e.preventDefault()
  e.stopPropagation()
  deleteViewTarget.value = view
  deleteViewType.value = type
  deleteViewConfirmName.value = ''
  showDeleteView.value = true
}

async function deleteView() {
  if (!deleteViewTarget.value || !deleteViewConfirmValid.value) return
  deletingView.value = true
  try {
    const endpoint = deleteViewType.value === 'board'
      ? `/api/boards/${deleteViewTarget.value.id}`
      : `/api/lists/${deleteViewTarget.value.id}`
    await $fetch(endpoint, { method: 'DELETE' })
    showDeleteView.value = false
    deleteViewTarget.value = null
    await refresh()
  } catch {
    toast.add({ title: 'Failed to delete view', color: 'error' })
  } finally {
    deletingView.value = false
  }
}

// ─── Config bar tab ───
const configTab = ref<'statuses' | 'tags'>('statuses')

// ─── Tag management ───
const newTagName = ref('')
const newTagColor = ref('#6366f1')
const newTagColorOpen = ref(false)
const showAddTagPopover = ref(false)
const newTagNameInput = ref<HTMLInputElement | null>(null)

watch(showAddTagPopover, (open) => {
  if (open) {
    nextTick(() => newTagNameInput.value?.focus())
  }
})
const editingTagId = ref<string | null>(null)
const editingTagName = ref('')
const confirmDeleteTagId = ref<string | null>(null)
let confirmDeleteTagTimeout: ReturnType<typeof setTimeout> | null = null
const tagColorPopoverOpen = ref<Record<string, boolean>>({})

async function updateTagColor(tagId: string, color: string) {
  tagColorPopoverOpen.value[tagId] = false
  await $fetch(`/api/tags/${tagId}`, {
    method: 'PUT',
    body: { color }
  })
  await refresh()
}

async function addProjectTag() {
  if (!newTagName.value.trim() || !project.value) return
  await $fetch(`/api/projects/${project.value.id}/tags`, {
    method: 'POST',
    body: { name: newTagName.value.trim(), color: newTagColor.value }
  })
  newTagName.value = ''
  newTagColor.value = '#6366f1'
  showAddTagPopover.value = false
  await refresh()
}

function startEditTag(tag: { id: string, name: string }) {
  editingTagId.value = tag.id
  editingTagName.value = tag.name
}

async function saveEditTag() {
  if (!editingTagId.value || !editingTagName.value.trim()) return
  await $fetch(`/api/tags/${editingTagId.value}`, {
    method: 'PUT',
    body: { name: editingTagName.value.trim() }
  })
  editingTagId.value = null
  editingTagName.value = ''
  await refresh()
}

function cancelEditTag() {
  editingTagId.value = null
  editingTagName.value = ''
}

function requestDeleteTag(tagId: string) {
  if (confirmDeleteTagTimeout) clearTimeout(confirmDeleteTagTimeout)
  confirmDeleteTagId.value = tagId
  confirmDeleteTagTimeout = setTimeout(() => {
    confirmDeleteTagId.value = null
  }, 5000)
}

async function confirmDeleteTag(tagId: string) {
  if (confirmDeleteTagTimeout) clearTimeout(confirmDeleteTagTimeout)
  confirmDeleteTagId.value = null
  await $fetch(`/api/tags/${tagId}`, { method: 'DELETE' })
  await refresh()
}

function cancelDeleteTag() {
  if (confirmDeleteTagTimeout) clearTimeout(confirmDeleteTagTimeout)
  confirmDeleteTagId.value = null
}
</script>

<template>
  <UiPage
    :title="project?.name || ' '"
    :description="project?.description || undefined"
  >
    <template
      v-if="project"
      #leading
    >
      <span class="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary shrink-0">
        <UIcon
          :name="`i-lucide-${project.icon || 'folder'}`"
          class="text-base"
        />
      </span>
    </template>

    <template
      v-if="project"
      #meta
    >
      <UBadge
        :label="project.key"
        color="primary"
        variant="subtle"
        :ui="{ label: 'font-mono' }"
      />
    </template>

    <template
      v-if="project && (project.role === 'owner' || project.role === 'admin')"
      #actions
    >
      <UButton
        :to="`/projects?edit=${project.id}`"
        icon="i-lucide-settings"
        label="Settings"
        variant="ghost"
        color="neutral"
      />
    </template>

    <!-- Loading skeleton. The page previously reimplemented its own header,
         stats bar and card grid here, so every layout change had to be made
         twice inside this one file. USkeleton keeps it to shapes. -->
    <template v-if="!project">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-3.5 w-16" />
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-20"
        />
      </div>
    </template>

    <template v-else>
      <!-- Statuses / Tags config bar -->
      <div class="mb-8 rounded-lg bg-muted border border-muted border-accented overflow-hidden">
        <!-- Tab header -->
        <div class="flex items-center border-b border-default border-accented px-3">
          <button
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px"
            :class="configTab === 'statuses'
              ? 'text-default border-primary'
              : 'text-dimmed border-transparent hover:text-toned'"
            @click="configTab = 'statuses'"
          >
            <UIcon
              name="i-lucide-columns-3"
              class="text-xs"
            />
            Statuses
            <span class="text-xs font-semibold tabular-nums text-dimmed">{{ projectStatuses.length }}</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px"
            :class="configTab === 'tags'
              ? 'text-default border-primary'
              : 'text-dimmed border-transparent hover:text-toned'"
            @click="configTab = 'tags'"
          >
            <UIcon
              name="i-lucide-tag"
              class="text-xs"
            />
            Tags
            <span class="text-xs font-semibold tabular-nums text-dimmed">{{ projectTags.length }}</span>
          </button>

          <!-- Aggregate stats — right-aligned -->
          <div class="flex items-center gap-3 ml-auto shrink-0 pl-3">
            <span
              class="flex items-center gap-1 text-xs font-medium tabular-nums text-dimmed"
              title="Open cards"
            >
              <UIcon
                name="i-lucide-layers"
                class="text-sm"
              />
              {{ project.openCards || 0 }}
            </span>
            <span
              class="flex items-center gap-1 text-xs font-medium tabular-nums text-dimmed"
              title="Boards"
            >
              <UIcon
                name="i-lucide-layout-dashboard"
                class="text-sm"
              />
              {{ project.boards?.length || 0 }}
            </span>
            <span
              class="flex items-center gap-1 text-xs font-medium tabular-nums text-dimmed"
              title="Lists"
            >
              <UIcon
                name="i-lucide-list"
                class="text-sm"
              />
              {{ project.lists?.length || 0 }}
            </span>
          </div>
        </div>

        <!-- Tab content panels — grid overlay prevents layout shift between tabs -->
        <div class="grid min-h-[44px]">
          <div :class="configTab === 'statuses' ? '[grid-area:1/1]' : '[grid-area:1/1] invisible pointer-events-none'">
            <StatusManager
              :statuses="projectStatuses"
              :done-status-id="project.doneStatusId"
              :project-id="project.id"
              :is-owner-or-admin="isOwnerOrAdmin"
              @refresh="refresh"
            />
          </div>

          <!-- Tags tab content -->
          <div
            :class="configTab === 'tags' ? '[grid-area:1/1]' : '[grid-area:1/1] invisible pointer-events-none'"
            class="flex items-center gap-1.5 px-3 py-2 overflow-x-auto"
          >
            <template
              v-for="tag in projectTags"
              :key="tag.id"
            >
              <!-- Editing inline -->
              <div
                v-if="editingTagId === tag.id"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 border-2"
                :style="{ borderColor: tag.color + '40', backgroundColor: tag.color + '08' }"
              >
                <span
                  class="block w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: tag.color }"
                />
                <input
                  v-model="editingTagName"
                  type="text"
                  class="w-24 text-xs font-bold text-highlighted bg-transparent border-0 outline-none! ring-0! py-0 uppercase tracking-wide"
                  @keydown.enter="saveEditTag"
                  @keydown.escape="cancelEditTag"
                >
                <UButton
                  icon="i-lucide-check"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="saveEditTag"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="cancelEditTag"
                />
              </div>

              <!-- Tag chip — owner/admin: clickable popover -->
              <UPopover
                v-else-if="isOwnerOrAdmin"
                v-model:open="tagColorPopoverOpen[tag.id]"
              >
                <button
                  type="button"
                  class="tag-pill group/chip flex items-center gap-1 px-2.5 py-1 rounded-full shrink-0 text-xs font-bold uppercase tracking-wide transition-all duration-150 hover:shadow-md active:scale-95"
                  :style="{
                    color: tag.color,
                    backgroundColor: tag.color + '25',
                    boxShadow: `inset 0 0 0 1px ${tag.color}40`
                  }"
                  @dblclick="startEditTag(tag)"
                >
                  {{ tag.name }}
                </button>
                <template #content>
                  <div class="p-2.5 w-44">
                    <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                      Color
                    </p>
                    <ColorPicker
                      :model-value="tag.color"
                      size="md"
                      class="mb-3"
                      @update:model-value="updateTagColor(tag.id, $event)"
                    />
                    <div class="flex flex-col gap-0.5 border-t border-muted pt-2">
                      <button
                        type="button"
                        class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-muted hover:text-default hover:bg-elevated transition-colors"
                        @click="tagColorPopoverOpen[tag.id] = false; startEditTag(tag)"
                      >
                        <UIcon
                          name="i-lucide-pencil"
                          class="text-xs"
                        />
                        Rename
                      </button>
                      <template v-if="confirmDeleteTagId === tag.id">
                        <div class="flex items-center gap-1 px-2 py-1.5">
                          <span class="text-xs font-medium text-error">Delete?</span>
                          <UButton
                            icon="i-lucide-check"
                            variant="ghost"
                            color="error"
                            size="xs"
                            @click="confirmDeleteTag(tag.id); tagColorPopoverOpen[tag.id] = false"
                          />
                          <UButton
                            icon="i-lucide-x"
                            variant="ghost"
                            color="neutral"
                            size="xs"
                            @click="cancelDeleteTag"
                          />
                        </div>
                      </template>
                      <button
                        v-else
                        type="button"
                        class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-error hover:bg-error/10 transition-colors"
                        @click="requestDeleteTag(tag.id)"
                      >
                        <UIcon
                          name="i-lucide-trash-2"
                          class="text-xs"
                        />
                        Delete
                      </button>
                    </div>
                  </div>
                </template>
              </UPopover>

              <!-- Tag chip — read-only (members) -->
              <div
                v-else
                class="tag-pill flex items-center px-2.5 py-1 rounded-full shrink-0 text-xs font-bold uppercase tracking-wide"
                :style="{
                  color: tag.color,
                  backgroundColor: tag.color + '25',
                  boxShadow: `inset 0 0 0 1px ${tag.color}40`
                }"
              >
                {{ tag.name }}
              </div>
            </template>

            <!-- Add tag (owner/admin) -->
            <UPopover
              v-if="isOwnerOrAdmin"
              v-model:open="showAddTagPopover"
            >
              <button
                type="button"
                class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-dimmed hover:text-primary hover:bg-white hover:bg-elevated transition-colors shrink-0"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="text-xs"
                />
                <span>Tag</span>
              </button>
              <template #content>
                <form
                  class="p-3 w-52"
                  @submit.prevent="addProjectTag"
                >
                  <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    New tag
                  </p>
                  <div class="flex items-center gap-2 mb-2">
                    <UPopover v-model:open="newTagColorOpen">
                      <button
                        type="button"
                        class="w-5 h-5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-primary transition-all cursor-pointer"
                        :style="{ backgroundColor: newTagColor }"
                      />
                      <template #content>
                        <div class="p-2">
                          <ColorPicker
                            v-model="newTagColor"
                            size="md"
                          />
                        </div>
                      </template>
                    </UPopover>
                    <input
                      ref="newTagNameInput"
                      v-model="newTagName"
                      type="text"
                      placeholder="Tag name..."
                      class="flex-1 text-sm font-medium text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border border-accented rounded-md px-2 py-1 outline-none! ring-0! focus:border-primary transition-colors"
                      @keydown.enter.prevent="addProjectTag"
                    >
                  </div>
                  <UButton
                    type="submit"
                    size="xs"
                    color="primary"
                    variant="solid"
                    :disabled="!newTagName.trim()"
                    class="w-full justify-center"
                  >
                    Add Tag
                  </UButton>
                </form>
              </template>
            </UPopover>

            <p
              v-if="projectTags.length === 0"
              class="text-xs text-dimmed italic"
            >
              {{ isOwnerOrAdmin ? 'Create your first tag to label cards.' : 'No tags yet.' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Views + Members side by side -->
      <div class="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8">
        <!-- Views (Boards + Lists) -->
        <div>
          <h2 class="flex items-center gap-1.5 text-sm font-bold text-muted uppercase tracking-[0.08em] mb-2">
            <UIcon
              name="i-lucide-layout-grid"
              class="text-base"
            />
            Views
          </h2>
          <p class="text-xs text-dimmed mb-4">
            Boards and lists for viewing this project's cards
          </p>

          <div class="grid grid-cols-2 gap-3">
            <NuxtLink
              v-for="view in allViews"
              :key="view.id"
              :to="view._type === 'board'
                ? `/projects/${slug}/boards/${view.slug || view.id}`
                : `/projects/${slug}/lists/${view.slug || view.id}`"
              class="group block"
            >
              <div
                class="relative rounded-xl border border-default bg-default p-4 hover:border-primary/60 hover:shadow-md hover:shadow-indigo-500/5 transition-all"
                :style="{ borderLeftWidth: '3px', borderLeftColor: ACCENT_COLORS[hashCode(view.id) % ACCENT_COLORS.length] }"
              >
                <UTooltip
                  v-if="canDeleteView(view)"
                  :text="`Delete ${view._type}`"
                >
                  <button
                    class="absolute top-2 right-2 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 p-1 rounded-md text-error hover:text-error hover:bg-error/10 transition-all"
                    @click="openDeleteView(view, view._type, $event)"
                  >
                    <UIcon
                      name="i-lucide-trash-2"
                      class="text-sm"
                    />
                  </button>
                </UTooltip>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-3">
                    <div
                      class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                      :style="{ backgroundColor: ACCENT_COLORS[hashCode(view.id) % ACCENT_COLORS.length] + '12', color: ACCENT_COLORS[hashCode(view.id) % ACCENT_COLORS.length] }"
                    >
                      <UIcon
                        :name="view._type === 'board' ? 'i-lucide-layout-dashboard' : 'i-lucide-list'"
                        class="text-base"
                      />
                    </div>
                    <span class="font-semibold text-base tracking-[-0.01em] group-hover:text-primary transition-colors flex-1 min-w-0 truncate">
                      {{ view.name }}
                    </span>
                  </div>
                  <div class="flex items-center justify-end gap-3 text-xs text-dimmed">
                    <span class="flex items-center gap-1">
                      <UIcon
                        name="i-lucide-layers"
                        class="text-xs"
                      />
                      {{ view.cardCount ?? 0 }}
                    </span>
                    <template v-if="view.lastActivity">
                      <span class="flex items-center gap-1">
                        <UIcon
                          name="i-lucide-clock"
                          class="text-xs"
                        />
                        {{ relativeTime(view.lastActivity) }}
                      </span>
                    </template>
                    <span
                      v-if="view.createdBy"
                      class="flex items-center gap-1"
                    >
                      <UIcon
                        name="i-lucide-user"
                        class="text-xs"
                      />
                      {{ view.createdBy.name.split(' ').map((w: string) => w[0]).join('').toUpperCase() }}
                    </span>
                  </div>
                </div>
              </div>
            </NuxtLink>

            <!-- Ghost "+ New View" card -->
            <button
              type="button"
              class="rounded-xl border-2 border-dashed border-accented p-4 hover:border-primary hover:border-primary/40 hover:bg-primary/5 hover:bg-primary/10 transition-all cursor-pointer group text-left"
              @click="showNewView = true"
            >
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-elevated text-dimmed group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                  <UIcon
                    name="i-lucide-plus"
                    class="text-base"
                  />
                </div>
                <span class="text-base font-medium text-dimmed group-hover:text-primary transition-colors">
                  New View
                </span>
              </div>
            </button>
          </div>
        </div>

        <!-- Members -->
        <div class="max-lg:mt-8">
          <h2 class="flex items-center gap-1.5 text-sm font-bold text-muted uppercase tracking-[0.08em] mb-2">
            <UIcon
              name="i-lucide-users"
              class="text-base"
            />
            Members
          </h2>
          <p class="text-xs text-dimmed mb-4">
            People with access to this project
          </p>
          <ProjectMembers :project-id="project.id" />
        </div>
      </div>

      <!-- New View Modal (3 steps) -->
      <CreateViewModal
        v-model:open="showNewView"
        :project-id="project.id"
        :project-name="project.name"
        :project-slug="slug"
        :statuses="projectStatuses"
        :tags="projectTags"
        @created="onViewCreated"
      />

      <!-- Delete View Modal (boards and lists) -->
      <UModal
        v-model:open="showDeleteView"
        :title="`Delete ${deleteViewType === 'board' ? 'Board' : 'List'}`"
      >
        <template #body>
          <div class="flex flex-col gap-3">
            <p class="text-base text-toned">
              This will permanently delete <span class="font-bold text-highlighted">{{ deleteViewTarget?.name }}</span>.
              <template v-if="deleteViewType === 'board'">
                Columns will be unlinked.
              </template>
              Cards and statuses are preserved at the project level.
            </p>
            <p class="text-sm font-medium text-error">
              Type <span class="font-bold">{{ deleteViewTarget?.name }}</span> to confirm.
            </p>
            <input
              v-model="deleteViewConfirmName"
              type="text"
              :placeholder="deleteViewTarget?.name"
              class="w-full text-base text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-default border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
            >
            <div class="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-all"
                @click="showDeleteView = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!deleteViewConfirmValid || deletingView"
                @click="deleteView"
              >
                <UIcon
                  v-if="!deletingView"
                  name="i-lucide-trash-2"
                  class="text-sm"
                />
                <UIcon
                  v-else
                  name="i-lucide-loader-2"
                  class="text-sm animate-spin"
                />
                Delete {{ deleteViewType === 'board' ? 'Board' : 'List' }}
              </button>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UiPage>
</template>
