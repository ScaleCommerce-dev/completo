import type { BaseCard, Tag, Member } from '~/types/card'

/** Shared fields present in both Board and ListView API responses. */
interface ViewDataResponse {
  id: string
  tagFilters: string[]
  createdBy: { id: string, name: string, avatarUrl: string | null } | null
  role: string
  project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null, doneRetentionDays: number | null } | null
  members: Member[]
  tags: Tag[]
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
  const projectKey = computed(() => data.value?.project?.key || 'TK')
  const doneStatusId = computed(() => data.value?.project?.doneStatusId || null)

  const canConfigureColumns = computed(() => {
    if (!data.value) return false
    if (user.value?.isAdmin) return true
    if (data.value.createdBy?.id === user.value?.id) return true
    if (data.value.role === 'owner') return true
    return false
  })

  // ─── Card CRUD (identical across views) ───
  async function createCard(statusId: string, title: string, cardOpts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) {
    const card = await mutate(
      () => $fetch(`/api/${viewType}/${viewId.value}/cards`, {
        method: 'POST',
        body: { statusId, title, description: cardOpts?.description, priority: cardOpts?.priority, assigneeId: cardOpts?.assigneeId, dueDate: cardOpts?.dueDate }
      }),
      'Failed to create card'
    )
    await refresh()
    return card
  }

  async function updateCard(cardId: number, updates: Partial<BaseCard>) {
    const card = await mutate(
      () => $fetch(`/api/cards/${cardId}`, { method: 'PUT', body: updates }),
      'Failed to update card'
    )
    await refresh()
    return card
  }

  async function deleteCard(cardId: number) {
    await mutate(
      () => $fetch(`/api/cards/${cardId}`, { method: 'DELETE' }),
      'Failed to delete card'
    )
    await refresh()
  }

  async function updateCardTags(cardId: number, tagIds: string[]) {
    await mutate(
      () => $fetch(`/api/cards/${cardId}/tags`, { method: 'PUT', body: { tagIds } }),
      'Failed to update tags'
    )
    await refresh()
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

  async function updateTagFilters(tagIds: string[]) {
    await mutate(
      () => $fetch(`/api/${viewType}/${viewId.value}` as string, {
        method: 'PUT' as const,
        body: { tagFilters: tagIds }
      }),
      'Failed to update tag filters'
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
    projectKey,
    doneStatusId,
    canConfigureColumns,
    // Card CRUD
    createCard,
    updateCard,
    deleteCard,
    updateCardTags,
    // View operations
    reorderColumns,
    updateTagFilters
  }
}
