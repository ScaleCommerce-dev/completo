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
  tags: Array<{ id: string, name: string, color: string }>
  members: Array<{ id: string, name: string, avatarUrl: string | null }>
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
  const { mutate, toast } = useMutation()
  const currentUserId = computed(() => useUserSession().user.value?.id)
  // `deep: true` for the same reason `useViewData` needs it: the card mutations
  // below patch `data.value.groups[i].cards[j]` in place, and `useFetch`
  // defaults to a `shallowRef`, so the patched row would be a raw object Vue
  // never re-renders. The request would fire, the database would update, and the
  // table would keep showing the old value until something unrelated flushed it.
  const { data, refresh, status } = useFetch<MyTasksData>('/api/my-tasks', { deep: true })

  const columns = computed(() =>
    (data.value?.columns || []).sort((a, b) => a.position - b.position)
  )

  const collapsedProjectIds = computed(() =>
    new Set(data.value?.collapsedProjectIds || [])
  )

  const groups = computed(() => data.value?.groups || [])

  /**
   * The column set is server-generated (ids, positions), rare to change, and
   * structural rather than per-row — so these keep the refetch. It is the *card*
   * mutations below that must not, and they are the ones a user fires by the
   * dozen. `mutate` already toasts, so the catch exists only to keep the refresh
   * on the failure path, where the local column list is now the stale one.
   */
  async function withRefresh<T>(op: () => Promise<T>, message: string) {
    try {
      await mutate(op, message)
    } finally {
      await refresh()
    }
  }

  // ─── Column CRUD ───
  const addColumn = (field: string) =>
    withRefresh(() => $fetch('/api/my-tasks/columns', { method: 'POST', body: { field } }), 'Failed to add column')

  const removeColumn = (columnId: string) =>
    withRefresh(() => $fetch(`/api/my-tasks/columns/${columnId}`, { method: 'DELETE' }), 'Failed to remove column')

  const reorderColumns = (cols: { id: string, position: number }[]) =>
    withRefresh(() => $fetch('/api/my-tasks/columns/reorder', { method: 'PUT', body: { columns: cols } }), 'Failed to reorder columns')

  // ─── Collapse toggle ───
  /**
   * Purely a view preference, so it paints locally and persists in the
   * background. It used to round-trip and then refetch every card in every
   * project to learn one boolean it already knew.
   */
  async function toggleCollapse(projectId: string) {
    const ids = data.value?.collapsedProjectIds
    if (!ids) return
    const at = ids.indexOf(projectId)
    if (at >= 0) ids.splice(at, 1)
    else ids.push(projectId)

    try {
      await $fetch('/api/my-tasks/collapse', { method: 'POST', body: { projectId } })
    } catch (e) {
      if (at >= 0) ids.splice(at, 0, projectId)
      else ids.splice(ids.indexOf(projectId), 1)
      toast.add({ title: 'Failed to update collapse state', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
  }

  // ─── Card updates ───
  /** Guards the response merge below — see `write-sequence.ts`. */
  const beginWrite = createWriteSequence<number>()

  /** The card, its group and its index — the group carries the lookups. */
  function findCard(cardId: number) {
    for (const group of data.value?.groups || []) {
      const index = group.cards.findIndex(c => c.id === cardId)
      if (index >= 0) return { group, index, card: group.cards[index]! }
    }
    return null
  }

  /**
   * Same contract as `useViewData.resolveNested`, against the owning group
   * rather than a single project's lookups — this view spans projects, so a
   * status or member is only meaningful within the group the card sits in.
   */
  function resolveNested(found: NonNullable<ReturnType<typeof findCard>>, updates: Record<string, unknown>) {
    const { group, card } = found
    if ('statusId' in updates) {
      card.status = group.statuses.find(s => s.id === updates.statusId) ?? null
    }
    if ('assigneeId' in updates) {
      card.assignee = updates.assigneeId
        ? group.members.find(m => m.id === updates.assigneeId) ?? null
        : null
    }
  }

  async function updateCard(cardId: number, updates: Record<string, unknown>) {
    const found = findCard(cardId)
    const snapshot = found ? { ...found.card } : null
    const isLatest = beginWrite(cardId)

    if (found) {
      Object.assign(found.card, updates)
      resolveNested(found, updates)
    }

    try {
      const card = await $fetch<Record<string, unknown>>(`/api/cards/${cardId}`, { method: 'PUT', body: updates })
      // No `tags`/`attachmentCount` on the response, so assigning it over the
      // row leaves those intact rather than blanking them.
      if (found && card && isLatest()) Object.assign(found.card, card)

      // This view *is* "cards assigned to me" (see my-tasks.get.ts), so handing
      // one to somebody else removes it. The refetch used to do that as a side
      // effect of redoing everything; now it is the explicit rule.
      if (found && 'assigneeId' in updates && updates.assigneeId !== currentUserId.value) {
        dropCard(found)
      }
      return card
    } catch (e) {
      if (found && snapshot && isLatest()) Object.assign(found.card, snapshot)
      toast.add({ title: 'Failed to update card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
  }

  async function updateCardTags(cardId: number, tagIds: string[]) {
    const found = findCard(cardId)
    const snapshot = found ? found.card.tags : undefined

    if (found) found.card.tags = found.group.tags.filter(t => tagIds.includes(t.id))

    try {
      await $fetch(`/api/cards/${cardId}/tags`, { method: 'PUT', body: { tagIds } })
    } catch (e) {
      if (found && snapshot) found.card.tags = snapshot
      toast.add({ title: 'Failed to update tags', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
  }

  /**
   * Remove a card, and its group with it once the group is empty — the endpoint
   * drops empty groups (`.filter(g => g.cards.length > 0)`), so leaving a bare
   * project heading behind would be a state the server never produces.
   */
  function dropCard(found: NonNullable<ReturnType<typeof findCard>>) {
    found.group.cards.splice(found.index, 1)
    const groups = data.value?.groups
    if (groups && !found.group.cards.length) {
      const at = groups.indexOf(found.group)
      if (at >= 0) groups.splice(at, 1)
    }
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
    updateCard,
    updateCardTags
  }
}
