interface MyTasksGroup {
  project: {
    id: string
    name: string
    slug: string
    key: string
    icon: string | null
    doneStatusId: string | null
    doneRetentionDays: number | null
  }
  statuses: Array<{ id: string, name: string, color: string | null }>
  cards: Array<{
    id: number
    title: string
    description: string | null
    priority: string
    statusId: string
    assigneeId: string | null
    position: number
    assignee: { id: string, name: string, avatarUrl: string | null } | null
    status: { id: string, name: string, color: string | null } | null
    tags: Array<{ id: string, name: string, color: string }>
    dueDate: string | null
    createdAt: string
    updatedAt: string
  }>
}

interface MyTasksData {
  columns: Array<{ id: string, field: string, position: number }>
  collapsedProjectIds: string[]
  groups: MyTasksGroup[]
}

export function useMyTasks() {
  const { mutate } = useMutation()
  const { data, refresh, status } = useFetch<MyTasksData>('/api/my-tasks')

  const columns = computed(() =>
    (data.value?.columns || []).sort((a, b) => a.position - b.position)
  )

  const collapsedProjectIds = computed(() =>
    new Set(data.value?.collapsedProjectIds || [])
  )

  const groups = computed(() => data.value?.groups || [])

  // ─── Column CRUD ───
  async function addColumn(field: string) {
    try {
      await mutate(
        () => $fetch('/api/my-tasks/columns', { method: 'POST', body: { field } }),
        'Failed to add column'
      )
    } catch {
      // error already toasted
    }
    await refresh()
  }

  async function removeColumn(columnId: string) {
    try {
      await mutate(
        () => $fetch(`/api/my-tasks/columns/${columnId}`, { method: 'DELETE' }),
        'Failed to remove column'
      )
    } catch {
      // error already toasted
    }
    await refresh()
  }

  async function reorderColumns(cols: { id: string, position: number }[]) {
    try {
      await mutate(
        () => $fetch('/api/my-tasks/columns/reorder', { method: 'PUT', body: { columns: cols } }),
        'Failed to reorder columns'
      )
    } catch {
      // error already toasted
    }
    await refresh()
  }

  // ─── Collapse toggle ───
  async function toggleCollapse(projectId: string) {
    try {
      await mutate(
        () => $fetch('/api/my-tasks/collapse', { method: 'POST', body: { projectId } }),
        'Failed to update collapse state'
      )
    } catch {
      // error already toasted
    }
    await refresh()
  }

  // ─── Card updates (inline priority + done) ───
  async function updateCard(cardId: number, updates: Record<string, unknown>) {
    try {
      await mutate(
        () => $fetch(`/api/cards/${cardId}`, { method: 'PUT', body: updates }),
        'Failed to update card'
      )
    } catch {
      // error already toasted
    }
    await refresh()
  }

  return {
    data,
    columns,
    collapsedProjectIds,
    groups,
    status,
    refresh,
    addColumn,
    removeColumn,
    reorderColumns,
    toggleCollapse,
    updateCard
  }
}
