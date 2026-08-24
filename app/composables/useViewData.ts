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
  // `deep: true` is load-bearing, not a preference. Nuxt's useFetch defaults to a
  // shallowRef, so `data.value.cards[i]` would be a raw object and the optimistic
  // patches below would mutate it without Vue ever noticing — the board would keep
  // rendering the previous value until something unrelated forced a re-render.
  // That was survivable while every mutation ended in refresh() (which replaces
  // `data.value` wholesale); it is not, now that they don't.
  const { data: rawData, error, refresh, status } = useFetch<T>(`/api/${viewType}/${slugOrId}`, {
    query,
    deep: true
  })

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

  /** Guards the response merges below — see `write-sequence.ts`. */
  const beginWrite = createWriteSequence<number>()

  // Cards with a local write in flight. A live `card.upsert`/`card.delete` for one
  // of these is ignored: the optimistic patch already shows the intended state and
  // the write's own response is the authority for it (ordered by `beginWrite`).
  // Without this, an event echoing an *earlier* value — this client's own change
  // bouncing back, or a concurrent edit — could repaint the row mid-edit. It is a
  // plain Set, not reactive: nothing renders from it, it only gates the handlers.
  const pendingCards = new Set<number>()
  function markCardPending(id: number) {
    pendingCards.add(id)
  }
  function clearCardPending(id: number) {
    pendingCards.delete(id)
  }

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
    const isLatest = beginWrite(cardId)
    markCardPending(cardId)

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
      //
      // Skipped once a newer write has been issued for this card: merging then
      // would repaint the row with the value the *previous* edit set.
      if (found && card && isLatest()) Object.assign(found.card, card)
      return card
    } catch (e) {
      if (found && snapshot && isLatest()) Object.assign(found.card, snapshot)
      toast.add({ title: 'Failed to update card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    } finally {
      // Only the newest write clears the gate — an older write settling first must
      // not reopen the row to events while a newer edit is still in flight.
      if (isLatest()) clearCardPending(cardId)
    }
  }

  async function deleteCard(cardId: number) {
    const found = findCard(cardId)
    const removed = found ? found.cards.splice(found.index, 1)[0] : null
    markCardPending(cardId)

    try {
      await $fetch(`/api/cards/${cardId}`, { method: 'DELETE' })
    } catch (e) {
      if (found && removed) found.cards.splice(found.index, 0, removed)
      toast.add({ title: 'Failed to delete card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    } finally {
      clearCardPending(cardId)
    }
  }

  async function updateCardTags(cardId: number, tagIds: string[]) {
    const found = findCard(cardId)
    const snapshot = found ? found.card.tags : undefined
    markCardPending(cardId)

    if (found) {
      found.card.tags = tagsData.value.filter(t => tagIds.includes(t.id))
    }

    try {
      await $fetch(`/api/cards/${cardId}/tags`, { method: 'PUT', body: { tagIds } })
    } catch (e) {
      if (found) found.card.tags = snapshot
      toast.add({ title: 'Failed to update tags', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    } finally {
      clearCardPending(cardId)
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

  // ─── Live updates (SSE) ─────────────────────────────────────────────────────
  //
  // Everything above keeps *this* client's own edits on screen; this keeps it in
  // step with changes made anywhere else — another person, the CLI, an AI agent.
  // Card lifecycle events patch the local rows exactly as the optimistic mutations
  // do (no wholesale refetch, no animation replay); structural changes it cannot
  // express as a row patch trigger a debounced refetch instead.

  // Coalesce a burst of structural events (a drag that renumbers every column
  // emits many) into one refetch. refresh() replaces the view wholesale, so it is
  // the expensive path and the one worth debouncing.
  let invalidateTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleRefresh() {
    if (invalidateTimer) clearTimeout(invalidateTimer)
    invalidateTimer = setTimeout(() => {
      invalidateTimer = null
      void refresh()
    }, 300)
  }
  onScopeDispose(() => {
    if (invalidateTimer) clearTimeout(invalidateTimer)
  })

  useProjectEvents(() => data.value?.project?.id ?? null, {
    onCardUpsert(card) {
      if (pendingCards.has(card.id)) return
      const cards = cardList.value
      if (!cards) return
      const belongs = cardBelongsToView(viewType, statusList.value.map(s => s.id), card)
      applyCardUpsert(cards as unknown as BaseCard[], card, belongs)
    },
    onCardDelete(id) {
      if (pendingCards.has(id)) return
      const cards = cardList.value
      if (cards) applyCardDelete(cards, id)
    },
    onViewInvalidate: scheduleRefresh
  })

  return {
    data,
    error,
    viewId,
    status,
    refresh,
    markCardPending,
    clearCardPending,
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
