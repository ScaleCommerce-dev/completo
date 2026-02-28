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
  const {
    data: list,
    error,
    viewId: listId,
    status,
    refresh,
    toast,
    mutate,
    membersData,
    tagsData,
    tagFilters,
    projectKey,
    doneStatusId,
    canConfigureColumns,
    createCard,
    updateCard,
    deleteCard,
    updateCardTags,
    reorderColumns,
    updateTagFilters
  } = useViewData<ListView>('lists', listSlugOrId, opts)

  const columnsData = computed(() => {
    return (list.value?.columns || []).sort((a, b) => a.position - b.position)
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

  // Rename has custom error handling (409 slug conflict fallback)
  async function renameList(name: string): Promise<string | null> {
    const slug = generateSlug(name)
    try {
      await $fetch(`/api/lists/${listId.value}` as string, {
        method: 'PUT' as const,
        body: { name, slug }
      })
      toast.add({ title: 'List renamed', color: 'success' })
      return slug
    } catch (e: unknown) {
      const err = e as { data?: { statusCode?: number } }
      if (err?.data?.statusCode === 409) {
        await $fetch(`/api/lists/${listId.value}` as string, {
          method: 'PUT' as const,
          body: { name }
        })
        toast.add({ title: 'List renamed', color: 'success' })
        return list.value?.slug || null
      }
      toast.add({ title: 'Failed to rename list', color: 'error' })
      throw e
    }
  }

  return {
    list,
    error,
    columnsData,
    allCards,
    statusesData,
    membersData,
    tagsData,
    tagFilters,
    projectKey,
    doneStatusId,
    sortField,
    sortDirection,
    canConfigureColumns,
    canSaveSort,
    status,
    refresh,
    createCard,
    updateCard,
    deleteCard,
    updateCardTags,
    updateTagFilters,
    addColumn,
    removeColumn,
    reorderColumns,
    saveSort,
    renameList
  }
}
