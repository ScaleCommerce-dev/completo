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
  hasUnread?: boolean
}

/** Shared fields present in both Board and ListView API responses. */
interface ViewDataResponse {
  id: string
  tagFilters: string[]
  statusFilters: string[]
  assigneeFilters: string[]
  priorityFilters: string[]
  /** Whether sub-tasks get cards (rows) of their own here. Off by default. */
  showSubtasks?: boolean
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
  const showSubtasks = computed(() => data.value?.showSubtasks ?? false)

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

  /**
   * A card just created, in the shape a view row has. The POST answers with the
   * row and its assignee; the rest of a view card is either derivable here
   * (status, parent) or what any card has at birth (no tags, files, comments or
   * sub-tasks). The server's live `card.upsert` for the same card follows and is
   * merged over this row by `applyCardUpsert`, so anything approximated here,
   * such as the creator, is corrected without a refetch.
   */
  function newViewCard(created: Record<string, unknown> & { id: number, statusId: string, parentId?: number | null }): ViewCard {
    const parentId = created.parentId ?? null
    const parent = parentId ? cardList.value?.find(c => c.id === parentId) as { id: number, title?: string } | undefined : undefined
    return {
      ...created,
      status: statusList.value.find(s => s.id === created.statusId) ?? null,
      tags: [],
      attachmentCount: 0,
      commentCount: 0,
      subtasks: null,
      parent: parent ? { id: parent.id, title: parent.title ?? '' } : null,
      creator: user.value ? { id: user.value.id, name: user.value.name, avatarUrl: user.value.avatarUrl ?? null } : null,
      hasUnread: false
    } as unknown as ViewCard
  }

  /**
   * Creating adds the card to the view rather than refetching the whole view,
   * which is what every other card mutation already does (see below). Whether it
   * is drawn is the view's own business, decided at render time from the same
   * filters a live update goes through; a board additionally holds only cards
   * in its own columns, which `cardBelongsToView` checks.
   */
  async function createCard(statusId: string, title: string, cardOpts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) {
    const card = await mutate(
      () => $fetch<Record<string, unknown> & { id: number, statusId: string, parentId?: number | null }>(`/api/projects/${data.value!.project!.id}/cards`, {
        method: 'POST',
        body: { statusId, title, description: cardOpts?.description, priority: cardOpts?.priority, assigneeId: cardOpts?.assigneeId, dueDate: cardOpts?.dueDate }
      }),
      'Failed to create card'
    )
    const cards = cardList.value
    // The live event may have landed first; it carries the full row, so keep it.
    if (card && cards && !findCard(card.id)) {
      applyCardUpsert(cards as unknown as BaseCard[], newViewCard(card) as unknown as BaseCard, cardBelongsToView(viewType, statusList.value.map(s => s.id), card))
    }
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
    const isLatest = beginWrite(cardId)
    markCardPending(cardId)
    try {
      return await putCardFields({
        cardId,
        row: (found?.card ?? null) as Record<string, unknown> | null,
        updates,
        resolve: () => found && resolveNested(found.card, updates),
        isLatest,
        onError: e => toast.add({ title: 'Failed to update card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      })
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

  /**
   * The view's display settings. `showSubtasks` is painted before the request,
   * because it decides which cards exist on screen and the refetch would
   * otherwise show the old set for a round trip.
   */
  async function updateDisplay(display: { hiddenCardFields?: string[], showSubtasks?: boolean }) {
    if (display.showSubtasks !== undefined && data.value) data.value.showSubtasks = display.showSubtasks
    await mutate(
      () => $fetch(`/api/${viewType}/${viewId.value}` as string, { method: 'PUT' as const, body: display }),
      'Failed to update display settings'
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
    onCardActivity({ id, actorId }) {
      // Your own comment is not unread to you; the server-computed hasUnread on
      // the next fetch agrees. Opening the card clears it again (useViewPage).
      if (actorId === user.value?.id) return
      const found = cardList.value?.find(c => c.id === id)
      if (found) found.hasUnread = true
    },
    onViewInvalidate: scheduleRefresh
  })

  /**
   * Rename the view, and its slug with it when the name has one. A slug another
   * view holds (409) keeps the old slug and renames anyway. Returns the slug the
   * view now has, for the page to move its address to. One copy for boards and
   * lists, which each had this word for word under their own name.
   */
  const NOUN = viewType === 'boards' ? 'Board' : 'List'
  async function renameView(name: string): Promise<string | null> {
    const slug = generateSlug(name)
    const put = (body: Record<string, string>) => $fetch(`/api/${viewType}/${viewId.value}` as string, { method: 'PUT' as const, body })
    try {
      // A name with no latin letters or digits has no slug; it keeps the one it has.
      await put(slug ? { name, slug } : { name })
      toast.add({ title: `${NOUN} renamed`, color: 'success' })
      return slug || (data.value as { slug?: string } | null)?.slug || null
    } catch (e: unknown) {
      const err = e as { data?: { statusCode?: number } }
      if (err?.data?.statusCode === 409) {
        await put({ name })
        toast.add({ title: `${NOUN} renamed`, color: 'success' })
        return (data.value as { slug?: string } | null)?.slug || null
      }
      toast.add({ title: `Failed to rename ${NOUN.toLowerCase()}`, color: 'error' })
      throw e
    }
  }

  /**
   * The page's two view-level actions, for boards and lists alike: rename and
   * follow the new slug in the address, and delete and go back to the project.
   * Each page had its own copy. `deletingView` is the delete's pending state,
   * owned here with the request so a failure cannot leave a spinner running.
   */
  const projectSlugForNav = () => opts?.projectSlug ?? data.value?.project?.slug
  async function renameAndFollow(name: string) {
    try {
      const newSlug = await renameView(name)
      if (newSlug && newSlug !== slugOrId) {
        await navigateTo(`/projects/${projectSlugForNav()}/${viewType}/${newSlug}`, { replace: true })
      } else {
        await refresh()
      }
    } catch {
      // `renameView` has said so.
    }
  }

  const deletingView = ref(false)
  async function deleteView() {
    if (!data.value) return
    deletingView.value = true
    try {
      await $fetch(`/api/${viewType}/${data.value.id}` as string, { method: 'DELETE' as const })
      await navigateTo(`/projects/${projectSlugForNav()}`)
    } catch (e) {
      toast.add({ title: `Failed to delete ${NOUN.toLowerCase()}`, description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    } finally {
      deletingView.value = false
    }
  }

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
    showSubtasks,
    canConfigureColumns,
    canModerateComments,
    // Card CRUD
    createCard,
    updateCard,
    deleteCard,
    updateCardTags,
    // View operations
    reorderColumns,
    updateFilters,
    updateDisplay,
    renameView,
    renameAndFollow,
    deleteView,
    deletingView
  }
}
