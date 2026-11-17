import type { CardWithStatus, Tag, Member, CardStatus } from '~/types/card'

type Card = CardWithStatus

interface ListColumn {
  id: string
  field: string
  position: number
}

type Status = CardStatus

interface ListView {
  id: string
  name: string
  slug: string
  projectId: string
  sortField: string | null
  sortDirection: string | null
  tagFilters: string[]
  statusFilters: string[]
  assigneeFilters: string[]
  priorityFilters: string[]
  createdBy: { id: string, name: string, avatarUrl: string | null } | null
  role: string
  project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null, doneRetentionDays: number | null } | null
  columns: ListColumn[]
  cards: Card[]
  members: Member[]
  statuses: Status[]
  tags: Tag[]
}

export function useListView(listSlugOrId: string, opts?: { projectSlug?: string }) {
  const view = useViewData<ListView>('lists', listSlugOrId, opts)
  const {
    data: list,
    viewId: listId,
    refresh,
    mutate,
    canConfigureColumns
  } = view

  const columnsData = computed(() => {
    return [...(list.value?.columns || [])].sort((a, b) => a.position - b.position)
  })

  const allCards = computed(() => list.value?.cards || [])

  const sortField = computed(() => list.value?.sortField || null)
  const sortDirection = computed(() => list.value?.sortDirection as 'asc' | 'desc' | null)

  const statusesData = computed(() => list.value?.statuses || [])

  async function addColumn(field: string) {
    await mutate(
      () => $fetch(`/api/lists/${listId.value}/columns`, { method: 'POST', body: { field } }),
      'Failed to add column'
    )
    await refresh()
  }

  async function removeColumn(columnId: string) {
    await mutate(
      () => $fetch(`/api/lists/${listId.value}/columns/${columnId}`, { method: 'DELETE' }),
      'Failed to remove column'
    )
    await refresh()
  }

  const canSaveSort = canConfigureColumns

  async function saveSort(field: string | null, direction: 'asc' | 'desc' | null) {
    await mutate(
      () => $fetch(`/api/lists/${listId.value}` as string, {
        method: 'PUT' as const,
        body: { sortField: field, sortDirection: direction }
      }),
      'Failed to save sort'
    )
    await refresh()
  }

  // Everything the shared view composable has, plus what only this view adds.
  // The list of forty pass-through names it replaced had to be kept in step by
  // hand, twice.
  return {
    ...view,
    list,
    columnsData,
    allCards,
    statusesData,
    sortField,
    sortDirection,
    canSaveSort,
    addColumn,
    removeColumn,
    saveSort
  }
}
