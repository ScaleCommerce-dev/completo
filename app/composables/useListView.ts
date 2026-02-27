interface Tag {
  id: string
  name: string
  color: string
}

interface Card {
  id: number
  statusId: string
  projectId: string
  title: string
  description: string | null
  assigneeId: string | null
  priority: string
  dueDate: string | null
  position: number
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  status: { id: string, name: string, color: string | null } | null
  tags?: Tag[]
  createdAt: string
  updatedAt: string
}

interface ListColumn {
  id: string
  field: string
  position: number
}

interface Status {
  id: string
  name: string
  color: string | null
}

interface Member {
  id: string
  name: string
  avatarUrl: string | null
}

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
  const toast = useToast()
  const { user } = useUserSession()
  const query = opts?.projectSlug ? { projectSlug: opts.projectSlug } : undefined
  const { data: list, error, refresh, status } = useFetch<ListView>(`/api/lists/${listSlugOrId}`, { query })

  const listId = computed(() => list.value?.id || listSlugOrId)

  const columnsData = computed(() => {
    return (list.value?.columns || []).sort((a, b) => a.position - b.position)
  })

  const allCards = computed(() => list.value?.cards || [])

  const sortField = computed(() => list.value?.sortField || null)
  const sortDirection = computed(() => list.value?.sortDirection as 'asc' | 'desc' | null)

  const statusesData = computed(() => list.value?.statuses || [])
  const membersData = computed(() => list.value?.members || [])
  const tagsData = computed(() => list.value?.tags || [])
  const projectKey = computed(() => list.value?.project?.key || 'TK')
  const doneStatusId = computed(() => list.value?.project?.doneStatusId || null)

  async function createCard(statusId: string, title: string, opts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) {
    try {
      const card = await $fetch(`/api/lists/${listId.value}/cards`, {
        method: 'POST',
        body: { statusId, title, description: opts?.description, priority: opts?.priority, assigneeId: opts?.assigneeId, dueDate: opts?.dueDate }
      })
      await refresh()
      return card
    } catch (e) {
      toast.add({ title: 'Failed to create card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function updateCard(cardId: number, updates: Partial<Card>) {
    try {
      const card = await $fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        body: updates
      })
      await refresh()
      return card
    } catch (e) {
      toast.add({ title: 'Failed to update card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function deleteCard(cardId: number) {
    try {
      await $fetch(`/api/cards/${cardId}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to delete card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function updateCardTags(cardId: number, tagIds: string[]) {
    try {
      await $fetch(`/api/cards/${cardId}/tags`, {
        method: 'PUT',
        body: { tagIds }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to update tags', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function addColumn(field: string) {
    try {
      await $fetch(`/api/lists/${listId.value}/columns`, {
        method: 'POST',
        body: { field }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to add column', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function removeColumn(columnId: string) {
    try {
      await $fetch(`/api/lists/${listId.value}/columns/${columnId}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to remove column', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function reorderColumns(columns: { id: string, position: number }[]) {
    try {
      await $fetch(`/api/lists/${listId.value}/columns/reorder`, {
        method: 'PUT',
        body: { columns }
      })
    } catch (e) {
      toast.add({ title: 'Failed to reorder columns', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
    await refresh()
  }

  const tagFilters = computed(() => list.value?.tagFilters || [])

  async function updateTagFilters(tagIds: string[]) {
    try {
      await $fetch(`/api/lists/${listId.value}` as string, {
        method: 'PUT' as const,
        body: { tagFilters: tagIds }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to update tag filters', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  const canConfigureColumns = computed(() => {
    if (!list.value) return false
    if (user.value?.isAdmin) return true
    if (list.value.createdBy?.id === user.value?.id) return true
    if (list.value.role === 'owner') return true
    return false
  })

  const canSaveSort = canConfigureColumns

  async function saveSort(field: string | null, direction: 'asc' | 'desc' | null) {
    try {
      await $fetch(`/api/lists/${listId.value}` as string, {
        method: 'PUT' as const,
        body: { sortField: field, sortDirection: direction }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to save sort', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

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
