<script setup lang="ts">
/**
 * Duplicate a card into a board of this or another of your projects — the "template card"
 * workflow (server/api/cards/[id]/duplicate.post.ts carries the rules).
 *
 * The title starts as "<title> (Copy)" and is selected on open, so typing
 * replaces it outright: a template is usually renamed for the run it starts.
 * Picking a board prefills the tags with that board's tag filter, because a board
 * only shows cards carrying one of them; they stay editable.
 */
interface BoardOption {
  id: string
  name: string
  tagFilters: string | string[] | null
  assigneeFilters: string | string[] | null
}

const props = defineProps<{
  cardId: number
  cardTitle: string
  projectSlug: string
}>()

const emit = defineEmits<{
  duplicated: [card: { id: number, projectKey: string, projectSlug: string }]
}>()

const open = defineModel<boolean>('open', { required: true })

const title = ref('')
const targetProjectSlug = ref<string>()
const boardId = ref<string>()
const tagIds = ref<string[]>([])
const projects = ref<Array<{ slug: string, name: string }>>([])
const boards = ref<BoardOption[]>([])
const tags = ref<Array<{ id: string, name: string, color: string }>>([])
const projectKey = ref('TK')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const titleInput = ref<HTMLInputElement>()

function asArray(value: string | string[] | null): string[] {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const projectItems = computed(() => projects.value.map(p => ({ value: p.slug, label: p.name })))
const boardItems = computed(() => boards.value.map(b => ({ value: b.id, label: b.name })))
const tagItems = computed(() => tags.value.map(t => ({ value: t.id, label: t.name, color: t.color })))
const selectedBoard = computed(() => boards.value.find(b => b.id === boardId.value))
const boardFiltersByAssignee = computed(() => !!selectedBoard.value && asArray(selectedBoard.value.assigneeFilters).length > 0)
const otherProject = computed(() => !!targetProjectSlug.value && targetProjectSlug.value !== props.projectSlug)
const canSubmit = computed(() => !!title.value.trim() && !!boardId.value && !saving.value && !loading.value)

watch(boardId, () => {
  tagIds.value = selectedBoard.value ? asArray(selectedBoard.value.tagFilters) : []
})

/** Boards and tags belong to a project, so both reload when the target changes. */
watch(targetProjectSlug, async (slug) => {
  boardId.value = undefined
  boards.value = []
  tags.value = []
  if (!slug) return
  loading.value = true
  error.value = ''
  try {
    const project = await $fetch<{
      key: string | null
      boards: BoardOption[]
      tags: Array<{ id: string, name: string, color: string }>
    }>(`/api/projects/${slug}`)
    if (targetProjectSlug.value !== slug) return // switched again meanwhile
    projectKey.value = project.key || 'TK'
    boards.value = project.boards
    tags.value = project.tags
    if (boards.value.length === 1) boardId.value = boards.value[0]!.id
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to load the project\'s boards')
  } finally {
    loading.value = false
  }
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  title.value = `${props.cardTitle} (Copy)`
  error.value = ''
  targetProjectSlug.value = undefined
  try {
    projects.value = await $fetch<Array<{ slug: string, name: string }>>('/api/projects')
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to load your projects')
  }
  targetProjectSlug.value = props.projectSlug
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
})

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = ''
  try {
    const copy = await $fetch<{ id: number }>(`/api/cards/${props.cardId}/duplicate`, {
      method: 'POST',
      body: { title: title.value.trim(), boardId: boardId.value, tagIds: tagIds.value }
    })
    open.value = false
    emit('duplicated', { id: copy.id, projectKey: projectKey.value, projectSlug: targetProjectSlug.value! })
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to duplicate card')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UiModal
    v-model:open="open"
    icon="i-lucide-copy-plus"
    tone="primary"
    title="Duplicate card"
    description="Title and description are copied, with every to-do unchecked."
    flush
  >
    <template #body>
      <form @submit.prevent="submit">
        <div class="px-5 pt-2 pb-1">
          <input
            ref="titleInput"
            v-model="title"
            type="text"
            aria-label="Title of the copy"
            placeholder="Title"
            class="w-full text-lg font-semibold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent rounded-none tracking-name leading-snug py-2 transition-colors"
          >
        </div>

        <div class="mx-5 mt-4 flex flex-col gap-3">
          <div
            v-if="projects.length > 1"
            class="flex items-start gap-2"
          >
            <span class="text-xs font-medium text-dimmed pt-[7px] w-16 shrink-0 text-right">Project</span>
            <USelectMenu
              v-model="targetProjectSlug"
              :items="projectItems"
              value-key="value"
              placeholder="Choose a project"
              size="sm"
              class="flex-1"
            />
          </div>

          <div class="flex items-start gap-2">
            <span class="text-xs font-medium text-dimmed pt-[7px] w-16 shrink-0 text-right">Board</span>
            <USelectMenu
              v-model="boardId"
              :items="boardItems"
              value-key="value"
              :loading="loading"
              placeholder="Choose a board"
              size="sm"
              class="flex-1"
            />
          </div>

          <div
            v-if="tags.length"
            class="flex items-start gap-2"
          >
            <span class="text-xs font-medium text-dimmed pt-[7px] w-16 shrink-0 text-right">Tags</span>
            <USelectMenu
              v-model="tagIds"
              :items="tagItems"
              multiple
              value-key="value"
              placeholder="No tags"
              size="sm"
              class="flex-1"
            >
              <template #item-leading="{ item }">
                <UiStatusDot
                  :color="item.color"
                  size="sm"
                />
              </template>
            </USelectMenu>
          </div>

          <p
            v-if="otherProject"
            class="text-xs text-dimmed leading-relaxed"
          >
            The copy moves to another project: it takes that project's tags, and mentions only notify its members.
          </p>

          <p
            v-if="boardFiltersByAssignee"
            class="text-xs text-warning leading-relaxed"
          >
            This board only shows some people's cards. The copy has no assignee yet, so it appears there once you assign one of them.
          </p>
        </div>

        <p
          v-if="error"
          class="mx-5 mt-3 text-xs font-medium text-error"
        >
          {{ error }}
        </p>

        <div class="flex items-center justify-end gap-2 px-5 pt-4 pb-5 mt-4 border-t border-muted">
          <UButton
            label="Cancel"
            variant="ghost"
            color="neutral"
            @click="open = false"
          />
          <UButton
            type="submit"
            label="Duplicate"
            icon="i-lucide-copy-plus"
            :loading="saving"
            :disabled="!canSubmit"
          />
        </div>
      </form>
    </template>
  </UiModal>
</template>
