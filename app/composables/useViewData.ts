import type { BaseCard, Tag, Member } from '~/types/card'

interface StatusLike {
  id: string
  name: string
  color: string | null
}

/**
 * A card as it appears in a view response: the row plus the nested objects the
 * UI renders directly. Optimistic patches have to keep those in step with the
 * ids, or changing an assignee would update `assigneeId` while the row kept
 * showing the previous person's name.
 */
interface ViewCard {
  id: number
  statusId: string
  assigneeId: string | null
  status?: StatusLike | null
  assignee?: Member | null
  tags?: Tag[]
}

/** Shared fields present in both Board and ListView API responses. */
interface ViewDataResponse {
  id: string
  tagFilters: string[]
  statusFilters: string[]
  assigneeFilters: string[]
  priorityFilters: string[]
  createdBy: { id: string, name: string, avatarUrl: string | null } | null
  role: string
  project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null, doneRetentionDays: number | null } | null
  members: Member[]
  tags: Tag[]
  cards?: ViewCard[]
  /**
   * Statuses, for resolving a card's nested `status` after an optimistic edit.
   *
   * They arrive under different keys, and the two `columns` are *not* the same
   * thing (see CLAUDE.md): a board column is a status shown on that board, while
   * a list column is which card field a table column displays. So `columns` is
   * deliberately opaque here and read through `statusList`, which knows which
   * view type it is looking at.
   */
  statuses?: StatusLike[]
  columns?: unknown[]
}

/**
 * Shared composable for board and list view data.
 * Provides: fetch, card CRUD, tag operations, column reorder, tag filters, permission checks.
 */
export function useViewData<T extends ViewDataResponse>(
  viewType: 'boards' | 'lists',
  slugOrId: string,
  opts?: { projectSlug?: string }
) {
  const { mutate, toast } = useMutation()
  const { user } = useUserSession()
  const query = opts?.projectSlug ? { projectSlug: opts.projectSlug } : undefined
  const { data: rawData, error, refresh, status } = useFetch<T>(`/api/${viewType}/${slugOrId}`, { query })

  // Cast to avoid Nuxt's complex Pick<T, ...> union type
  const data = rawData as Ref<T | null>

  const viewId = computed(() => data.value?.id || slugOrId)

  // ─── Shared computeds ───
  const membersData = computed((): Member[] => data.value?.members || [])
  const tagsData = computed((): Tag[] => data.value?.tags || [])
  const tagFilters = computed((): string[] => data.value?.tagFilters || [])
  const statusFilters = computed((): string[] => data.value?.statusFilters || [])
  const assigneeFilters = computed((): string[] => data.value?.assigneeFilters || [])
  const priorityFilters = computed((): string[] => data.value?.priorityFilters || [])
  const projectKey = computed(() => data.value?.project?.key || 'TK')
  const doneStatusId = computed(() => data.value?.project?.doneStatusId || null)

  const canConfigureColumns = computed(() => {
    if (!data.value) return false
    if (user.value?.isAdmin) return true
    if (data.value.createdBy?.id === user.value?.id) return true
    if (data.value.role === 'owner') return true
    return false
  })

  /**
   * May delete another member's comment. Deliberately *not* canConfigureColumns:
   * that also grants whoever created the view, which has no bearing on moderating
   * other people's words. Mirrors requireProjectOwner on the server.
   */
  const canModerateComments = computed(() => {
    if (!data.value) return false
    if (user.value?.isAdmin) return true
    return data.value.role === 'owner'
  })

  // ─── Card CRUD (identical across views) ───
  async function createCard(statusId: string, title: string, cardOpts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) {
    const card = await mutate(
      () => $fetch(`/api/projects/${data.value!.project!.id}/cards`, {
        method: 'POST',
        body: { statusId, title, description: cardOpts?.description, priority: cardOpts?.priority, assigneeId: cardOpts?.assigneeId, dueDate: cardOpts?.dueDate }
      }),
      'Failed to create card'
    )
    await refresh()
    return card
  }

  // ─── Optimistic card mutations ──────────────────────────────────────────────
  //
  // These used to `await $fetch()` and then `await refresh()`, so changing one
  // card's priority meant a PUT, then a full GET of the entire board, then a
  // re-render of every column. It was the most visible interaction problem in the
  // app: a one-click edit felt like a page load, and it re-ran the entrance
  // animations on the way back.
  //
  // Now the local row is patched first and the request reconciles it. On failure
  // the snapshot is restored, so a rejected edit visibly snaps back rather than
  // leaving the UI claiming something the server never accepted.

  const cardList = computed(() => data.value?.cards)

  /**
   * A board's `columns` are its statuses (plus a position); a list's `columns`
   * are field columns and carry no status at all, so it sends `statuses`
   * separately. Picking by view type rather than by whichever key is present
   * keeps a list from ever resolving a status out of a field column.
   */
  const statusList = computed<StatusLike[]>(() =>
    viewType === 'boards'
      ? ((data.value?.columns || []) as StatusLike[])
      : (data.value?.statuses || [])
  )

  function findCard(cardId: number) {
    const cards = cardList.value
    if (!cards) return null
    const index = cards.findIndex(c => c.id === cardId)
    return index >= 0 ? { cards, index, card: cards[index]! } : null
  }

  /**
   * Keep `status` and `assignee` consistent with their ids. The PUT response
   * resolves `assignee` for us but never `status`, and the optimistic paint has
   * to happen before any response arrives regardless.
   */
  function resolveNested(card: ViewCard, updates: Partial<BaseCard>) {
    if ('statusId' in updates) {
      card.status = statusList.value.find(s => s.id === updates.statusId) ?? null
    }
    if ('assigneeId' in updates) {
      card.assignee = updates.assigneeId
        ? membersData.value.find(m => m.id === updates.assigneeId) ?? null
        : null
    }
  }

  async function updateCard(cardId: number, updates: Partial<BaseCard>) {
    const found = findCard(cardId)
    const snapshot = found ? { ...found.card } : null

    if (found) {
      Object.assign(found.card, updates)
      resolveNested(found.card, updates)
    }

    try {
      const card = await $fetch<Record<string, unknown>>(`/api/cards/${cardId}`, {
        method: 'PUT',
        body: updates
      })
      // The response carries the canonical row (updatedAt, and a resolved
      // assignee). It has no `tags` or `attachmentCount` key, so assigning it
      // leaves those intact rather than blanking them.
      if (found && card) Object.assign(found.card, card)
      return card
    } catch (e) {
      if (found && snapshot) Object.assign(found.card, snapshot)
      toast.add({ title: 'Failed to update card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function deleteCard(cardId: number) {
    const found = findCard(cardId)
    const removed = found ? found.cards.splice(found.index, 1)[0] : null

    try {
      await $fetch(`/api/cards/${cardId}`, { method: 'DELETE' })
    } catch (e) {
      if (found && removed) found.cards.splice(found.index, 0, removed)
      toast.add({ title: 'Failed to delete card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  async function updateCardTags(cardId: number, tagIds: string[]) {
    const found = findCard(cardId)
    const snapshot = found ? found.card.tags : undefined

    if (found) {
      found.card.tags = tagsData.value.filter(t => tagIds.includes(t.id))
    }

    try {
      await $fetch(`/api/cards/${cardId}/tags`, { method: 'PUT', body: { tagIds } })
    } catch (e) {
      if (found) found.card.tags = snapshot
      toast.add({ title: 'Failed to update tags', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  // ─── View-scoped operations (use viewType for URL) ───
  async function reorderColumns(columns: { id: string, position: number }[]) {
    try {
      await $fetch(`/api/${viewType}/${viewId.value}/columns/reorder`, {
        method: 'PUT',
        body: { columns }
      })
    } catch (e) {
      toast.add({ title: 'Failed to reorder columns', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
    await refresh()
  }

  async function updateFilters(filters: {
    tagFilters?: string[]
    statusFilters?: string[]
    assigneeFilters?: string[]
    priorityFilters?: string[]
  }) {
    await mutate(
      () => $fetch(`/api/${viewType}/${viewId.value}` as string, {
        method: 'PUT' as const,
        body: filters
      }),
      'Failed to update filters'
    )
    await refresh()
  }

  return {
    data,
    error,
    viewId,
    status,
    refresh,
    toast,
    user,
    mutate,
    // Shared computeds
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
    // Card CRUD
    createCard,
    updateCard,
    deleteCard,
    updateCardTags,
    // View operations
    reorderColumns,
    updateFilters
  }
}
