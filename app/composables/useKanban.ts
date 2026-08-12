import type { BaseCard, Tag, Member } from '~/types/card'

interface Column {
  id: string
  projectId: string
  name: string
  position: number
  color: string | null
}

type Card = BaseCard

interface Board {
  id: string
  name: string
  slug: string
  projectId: string
  tagFilters: string[]
  statusFilters: string[]
  assigneeFilters: string[]
  priorityFilters: string[]
  createdBy: { id: string, name: string, avatarUrl: string | null } | null
  role: string
  project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null, doneRetentionDays: number | null } | null
  columns: Column[]
  cards: Card[]
  members: Member[]
  tags: Tag[]
  availableColumns: Column[]
}

export function useKanban(boardSlugOrId: string, opts?: { projectSlug?: string }) {
  const {
    data: board,
    error,
    viewId: boardId,
    status,
    refresh,
    toast,
    mutate,
    membersData,
    tagsData,
    tagFilters,
    statusFilters,
    assigneeFilters,
    priorityFilters,
    projectKey,
    doneStatusId,
    canConfigureColumns,
    canModerateComments,
    createCard,
    updateCard,
    deleteCard,
    updateCardTags,
    reorderColumns,
    updateFilters
  } = useViewData<Board>('boards', boardSlugOrId, opts)

  const columnsData = computed(() => {
    return (board.value?.columns || []).sort((a, b) => a.position - b.position)
  })

  const cardsByColumn = computed(() => {
    const grouped: Record<string, Card[]> = {}
    for (const col of columnsData.value) {
      grouped[col.id] = (board.value?.cards || [])
        .filter(c => c.statusId === col.id)
        .sort((a, b) => a.position - b.position)
    }
    return grouped
  })

  async function moveCard(cardId: number, toColumnId: string, toPosition: number) {
    // Optimistically renumber so the board reflects the move before the API
    // round-trip; otherwise the column the card was dragged out of briefly
    // reappears with the old order until refresh() returns.
    const cards = board.value?.cards
    const moving = cards?.find(c => c.id === cardId)
    if (cards && moving) {
      const fromColumnId = moving.statusId
      const target = cards.filter(c => c.statusId === toColumnId && c.id !== cardId)
        .sort((a, b) => a.position - b.position)
      target.splice(toPosition, 0, moving)
      target.forEach((c, i) => {
        c.position = i
        c.statusId = toColumnId
      })
      if (fromColumnId !== toColumnId) {
        cards.filter(c => c.statusId === fromColumnId && c.id !== cardId)
          .sort((a, b) => a.position - b.position)
          .forEach((c, i) => { c.position = i })
      }
    }

    try {
      await $fetch(`/api/cards/${cardId}/move`, {
        method: 'PUT',
        body: { statusId: toColumnId, position: toPosition }
      })
    } catch (e) {
      toast.add({ title: 'Failed to move card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
    await refresh()
  }

  async function addColumn(name: string, color?: string) {
    await mutate(
      () => $fetch(`/api/boards/${boardId.value}/columns`, { method: 'POST', body: { name, color } }),
      'Failed to add column'
    )
    await refresh()
  }

  async function updateColumn(columnId: string, updates: { name?: string, color?: string }) {
    await mutate(
      () => $fetch(`/api/statuses/${columnId}`, { method: 'PUT', body: updates }),
      'Failed to update column'
    )
    await refresh()
  }

  async function deleteColumn(columnId: string) {
    await mutate(
      () => $fetch(`/api/boards/${boardId.value}/columns/${columnId}`, { method: 'DELETE' }),
      'Failed to remove column'
    )
    await refresh()
  }

  async function linkColumn(columnId: string) {
    await mutate(
      () => $fetch(`/api/boards/${boardId.value}/columns/link`, { method: 'POST', body: { statusId: columnId } }),
      'Failed to link column'
    )
    await refresh()
  }

  const availableColumns = computed(() => board.value?.availableColumns || [])

  // Creating new columns is a project-level op — requires project owner or admin
  const canAddColumns = computed(() => {
    if (!board.value) return false
    if (useUserSession().user.value?.isAdmin) return true
    if (board.value.role === 'owner') return true
    return false
  })

  // Rename has custom error handling (409 slug conflict fallback)
  async function renameBoard(name: string): Promise<string | null> {
    const slug = generateSlug(name)
    try {
      await $fetch(`/api/boards/${boardId.value}` as string, {
        method: 'PUT' as const,
        body: { name, slug }
      })
      toast.add({ title: 'Board renamed', color: 'success' })
      return slug
    } catch (e: unknown) {
      const err = e as { data?: { statusCode?: number } }
      if (err?.data?.statusCode === 409) {
        await $fetch(`/api/boards/${boardId.value}` as string, {
          method: 'PUT' as const,
          body: { name }
        })
        toast.add({ title: 'Board renamed', color: 'success' })
        return board.value?.slug || null
      }
      toast.add({ title: 'Failed to rename board', color: 'error' })
      throw e
    }
  }

  return {
    board,
    error,
    columnsData,
    cardsByColumn,
    membersData,
    tagsData,
    tagFilters,
    statusFilters,
    assigneeFilters,
    priorityFilters,
    projectKey,
    doneStatusId,
    availableColumns,
    canConfigureColumns,
    canModerateComments,
    canAddColumns,
    status,
    refresh,
    moveCard,
    createCard,
    updateCard,
    deleteCard,
    addColumn,
    updateColumn,
    deleteColumn,
    linkColumn,
    reorderColumns,
    updateCardTags,
    updateFilters,
    renameBoard
  }
}
