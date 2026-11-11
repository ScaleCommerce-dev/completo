<script setup lang="ts">
/**
 * Duplicate a card into a board of this or another of your projects — the "template card"
 * workflow (server/api/cards/[id]/duplicate.post.ts carries the rules).
 *
 * The title is suggested per target project and selected on open, so typing
 * replaces it outright: a template is usually renamed for the run it starts.
 * Only a copy into the *same* project gets " (Copy)" — there it sits beside its
 * original and the two must be told apart. A copy into another project is the
 * template being used, not a second one; a suffix there is just something to
 * delete on every run. See `suggestedTitle`.
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
const members = ref<Array<{ id: string, name: string }>>([])
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

/**
 * What would keep the copy off the chosen board, in the card panel's own words
 * (`unmatchedFilters`, the same predicates the board filters with). Only tags and
 * assignee can fail: the server picks a status and a priority the board admits,
 * so those two filters are left out rather than guessed at here. The copy has no
 * assignee, so an assignee filter always fails until someone is assigned.
 */
const unmetFilters = computed(() => {
  const board = selectedBoard.value
  if (!board) return []
  return describeUnmatchedFilters(
    unmatchedFilters(
      { statusId: '', priority: 'medium', assigneeId: null, tags: tagIds.value.map(id => ({ id })) },
      { statusIds: [], priorities: [], assigneeIds: asArray(board.assigneeFilters), tagIds: new Set(asArray(board.tagFilters)) }
    ),
    { statuses: [], members: members.value, tags: tags.value }
  )
})
const otherProject = computed(() => !!targetProjectSlug.value && targetProjectSlug.value !== props.projectSlug)

function suggestedTitle(slug: string | undefined) {
  return slug === props.projectSlug ? `${props.cardTitle} (Copy)` : props.cardTitle
}
const canSubmit = computed(() => !!title.value.trim() && !!boardId.value && !saving.value && !loading.value)

watch(boardId, () => {
  tagIds.value = selectedBoard.value ? asArray(selectedBoard.value.tagFilters) : []
})

/** Boards and tags belong to a project, so both reload when the target changes. */
watch(targetProjectSlug, async (slug, previous) => {
  // The suggestion follows the project only while it is still untouched: a title
  // the user typed is theirs, whichever project they pick afterwards.
  if (slug && title.value === suggestedTitle(previous)) title.value = suggestedTitle(slug)
  boardId.value = undefined
  boards.value = []
  tags.value = []
  members.value = []
  if (!slug) return
  loading.value = true
  error.value = ''
  try {
    // Members only name the people an assignee filter asks for.
    const [project, projectMembers] = await Promise.all([
      $fetch<{
        key: string | null
        boards: BoardOption[]
        tags: Array<{ id: string, name: string, color: string }>
      }>(`/api/projects/${slug}`),
      $fetch<Array<{ id: string, name: string }>>(`/api/projects/${slug}/members`)
    ])
    if (targetProjectSlug.value !== slug) return // switched again meanwhile
    projectKey.value = project.key || 'TK'
    boards.value = project.boards
    tags.value = project.tags
    members.value = projectMembers
    if (boards.value.length === 1) boardId.value = boards.value[0]!.id
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to load the project\'s boards')
  } finally {
    loading.value = false
  }
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  title.value = suggestedTitle(props.projectSlug)
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

          <!-- Same alert, title and wording as the card panel's create form: it is
               the same situation, a card the chosen view will not draw. -->
          <UAlert
            v-if="unmetFilters.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-filter"
            title="Won't appear on this board yet"
            :ui="{ description: 'mt-1' }"
          >
            <template #description>
              <template v-if="unmetFilters.length === 1">
                This board's filters need {{ unmetFilters[0] }}.
              </template>
              <template v-else>
                This board's filters need:
                <ul class="mt-1 list-disc ps-4 space-y-0.5">
                  <li
                    v-for="line in unmetFilters"
                    :key="line"
                  >
                    {{ line }}
                  </li>
                </ul>
              </template>
            </template>
          </UAlert>
        </div>

        <p
          v-if="error"
          class="mx-5 mt-3 text-xs font-medium text-error"
        >
          {{ error }}
        </p>

        <!-- The form's own @submit is the only handler: the bar's `submit` event
             would fire on the same click and send the request twice. No ⌘⏎ hint,
             because nothing listens for it here. -->
        <div class="px-5 pt-4 pb-5 mt-4 border-t border-muted">
          <UiSaveBar
            submit-label="Duplicate"
            submit-type="submit"
            :shortcut="false"
            :loading="saving"
            :disabled="!canSubmit"
            @cancel="open = false"
          />
        </div>
      </form>
    </template>
  </UiModal>
</template>
