<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

/**
 * Find an issue to point at, in a menu attached to the control that opened it.
 *
 * Opened with nothing typed it suggests the open issues of the card's own
 * project, most recently updated first. A project key (`tk`, `TK-`, `TK-4`)
 * lists that project's open issues, narrowed by the digits after the dash.
 * Anything else is the app's card search: title, description, or an id typed
 * as `189` or `KEY-189`. Only issues the viewer can read come back either way
 * (`classifyPickerTerm`, `pickerSuggestions`).
 */
const props = defineProps<{
  placeholder: string
  /** The card's project, whose issues are suggested before anything is typed. */
  projectId: string
  /** Issues that may not be chosen, such as the card itself. */
  exclude?: number[]
}>()

const emit = defineEmits<{ select: [cardId: number] }>()

const open = ref(false)
const term = ref('')
const { projects } = useNavigation()
const index = inject(ISSUE_INDEX, null)

const query = computed(() => classifyPickerTerm(term.value, projects.value ?? []))

// The card search runs for free text, and for `KEY-4` too, so an exact id from
// a closed status or another project still turns up beside the browsed list.
const searchTerm = ref('')
watch(query, (q) => {
  searchTerm.value = q.kind === 'search' ? q.q : q.kind === 'project' && q.numberPrefix ? term.value.trim() : ''
})
const { results, loading: searching } = useCardSearch(searchTerm)

// One fetch per project while the menu lives; reopening on the same card
// reuses it. `view=all` because backlog issues are fair targets too, and
// `pickerSuggestions` drops the closed ones.
const projectIssues = reactive(new Map<string, IssueRow[]>())
const fetching = ref(false)

const browsedProjectId = computed(() => {
  if (!open.value) return null
  const q = query.value
  return q.kind === 'suggest' ? props.projectId : q.kind === 'project' ? q.projectId : null
})

watch(browsedProjectId, async (projectId) => {
  if (!projectId || projectIssues.has(projectId)) return
  fetching.value = true
  try {
    projectIssues.set(projectId, await $fetch<IssueRow[]>('/api/issues', { params: { projectId, view: 'all' } }))
  } catch {
    projectIssues.set(projectId, [])
  } finally {
    fetching.value = false
  }
})

type IssueItem = CommandPaletteItem & { status?: IssueStatus }

function toItem(id: number, title: string, ticket: string, status: IssueStatus | undefined): IssueItem {
  return { label: title, prefix: ticket, status, onSelect: () => pick(id) }
}

const items = computed<IssueItem[]>(() => {
  const q = query.value
  const exclude = props.exclude ?? []
  const browsed = browsedProjectId.value
    ? pickerSuggestions(projectIssues.get(browsedProjectId.value) ?? [], {
        exclude,
        numberPrefix: q.kind === 'project' ? q.numberPrefix : ''
      }).map(i => toItem(i.id, i.title, i.ticket, i.status))
    : []
  const shown = new Set(browsed.map(i => i.prefix))
  const found = (q.kind === 'suggest' ? [] : results.value)
    .filter(hit => !exclude.includes(hit.id))
    .map(hit => toItem(hit.id, hit.title, formatTicketId(hit.projectKey, hit.id), index?.value.get(hit.id)?.status))
    .filter(i => !shown.has(i.prefix))
  return [...browsed, ...found]
})

const groups = computed<CommandPaletteGroup<IssueItem>[]>(() => [{
  id: 'issues',
  ignoreFilter: true,
  items: items.value
}])

function pick(id: number) {
  emit('select', id)
  open.value = false
}

watch(open, (o) => {
  if (!o) term.value = ''
})
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="FIELD_MENU_ALIGN_END"
  >
    <slot />

    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups="groups"
        :loading="searching || fetching"
        :placeholder="placeholder"
        class="w-96 max-h-80"
      >
        <template #item-leading="{ item }">
          <TrackerStatusIcon
            v-if="(item as IssueItem).status"
            :category="(item as IssueItem).status!.category"
            :color="(item as IssueItem).status!.color"
          />
        </template>
        <template #empty>
          <p class="py-6 text-center text-sm text-dimmed">
            {{ term.trim() ? 'No matching issue' : 'No open issues in this project' }}
          </p>
        </template>
      </UCommandPalette>
    </template>
  </UPopover>
</template>
