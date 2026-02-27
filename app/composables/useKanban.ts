import type { Ref } from 'vue'

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
  tags?: Tag[]
  createdAt: string
  updatedAt: string
}

interface Column {
  id: string
  projectId: string
  name: string
  position: number
  color: string | null
}

interface Member {
  id: string
  name: string
  avatarUrl: string | null
}

interface Board {
  id: string
  name: string
  slug: string
  projectId: string
  tagFilters: string[]
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
  const toast = useToast()
  const { user } = useUserSession()
  const query = opts?.projectSlug ? { projectSlug: opts.projectSlug } : undefined
  const { data: board, error, refresh, status } = useFetch<Board>(`/api/boards/${boardSlugOrId}`, { query })

  // Use the resolved board ID for all mutation endpoints
  const boardId = computed(() => board.value?.id || boardSlugOrId)

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
    try {
      await $fetch(`/api/cards/${cardId}/move`, {
        method: 'PUT',
        body: { statusId: toColumnId, position: toPosition }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to move card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      await refresh()
    }
  }

  const projectKey = computed(() => board.value?.project?.key || 'TK')
  const doneStatusId = computed(() => board.value?.project?.doneStatusId || null)

  const membersData = computed(() => board.value?.members || [])

  async function createCard(statusId: string, title: string, opts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) {
    try {
      const card = await $fetch(`/api/boards/${boardId.value}/cards`, {
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

  async function addColumn(name: string, color?: string) {
    try {
      await $fetch(`/api/boards/${boardId.value}/columns`, {
        method: 'POST',
        body: { name, color }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to add column', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function updateColumn(columnId: string, updates: { name?: string, color?: string }) {
    try {
      await $fetch(`/api/statuses/${columnId}`, {
        method: 'PUT',
        body: updates
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to update column', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function deleteColumn(columnId: string) {
    try {
      await $fetch(`/api/boards/${boardId.value}/columns/${columnId}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to remove column', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function linkColumn(columnId: string) {
    try {
      await $fetch(`/api/boards/${boardId.value}/columns/link`, {
        method: 'POST',
        body: { statusId: columnId }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to link column', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  const tagsData = computed(() => board.value?.tags || [])

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

  const tagFilters = computed(() => board.value?.tagFilters || [])

  async function updateTagFilters(tagIds: string[]) {
    try {
      await $fetch(`/api/boards/${boardId.value}`, {
        method: 'PUT' as any,
        body: { tagFilters: tagIds }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to update tag filters', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  const availableColumns = computed(() => board.value?.availableColumns || [])

  const canConfigureColumns = computed(() => {
    if (!board.value) return false
    if (user.value?.isAdmin) return true
    if (board.value.createdBy?.id === user.value?.id) return true
    if (board.value.role === 'owner') return true
    return false
  })

  // Creating new columns is a project-level op — requires project owner or admin
  const canAddColumns = computed(() => {
    if (!board.value) return false
    if (user.value?.isAdmin) return true
    if (board.value.role === 'owner') return true
    return false
  })

  async function reorderColumns(columns: { id: string, position: number }[]) {
    try {
      await $fetch(`/api/boards/${boardId.value}/columns/reorder`, {
        method: 'PUT' as any,
        body: { columns }
      })
      await refresh()
    } catch (e) {
      toast.add({ title: 'Failed to reorder columns', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      await refresh()
    }
  }

  async function renameBoard(name: string): Promise<string | null> {
    const slug = generateSlug(name)
    try {
      await $fetch(`/api/boards/${boardId.value}`, {
        method: 'PUT' as any,
        body: { name, slug }
      })
      toast.add({ title: 'Board renamed', color: 'success' })
      return slug
    } catch (e: any) {
      if (e?.data?.statusCode === 409) {
        await $fetch(`/api/boards/${boardId.value}`, {
          method: 'PUT' as any,
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
    projectKey,
    doneStatusId,
    availableColumns,
    canConfigureColumns,
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
    updateTagFilters,
    renameBoard
  }
}
