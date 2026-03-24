import type { BaseCard } from '~/types/card'

interface ViewPageOptions {
  allCards: ComputedRef<BaseCard[]>
  tagFilters: ComputedRef<string[]>
  statusFilters: ComputedRef<string[]>
  assigneeFilters: ComputedRef<string[]>
  priorityFilters: ComputedRef<string[]>
  doneStatusId: ComputedRef<string | null>
  updateCardTags: (cardId: number, tagIds: string[]) => Promise<void>
  createCard: (statusId: string, title: string, opts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) => Promise<unknown>
  updateCard: (cardId: number, updates: Partial<BaseCard>) => Promise<unknown>
  deleteCard: (cardId: number) => Promise<void>
}

export function useViewPage(opts: ViewPageOptions) {
  const {
    allCards,
    tagFilters,
    statusFilters,
    assigneeFilters,
    priorityFilters,
    doneStatusId,
    updateCardTags,
    createCard,
    updateCard,
    deleteCard
  } = opts

  // All filters are persisted on the view, synced from props
  const activeTagFilters = ref<Set<string>>(new Set())

  watch(tagFilters, (tf) => {
    activeTagFilters.value = new Set(tf || [])
  }, { immediate: true })

  const isFiltered = computed(() =>
    activeTagFilters.value.size > 0
    || (statusFilters.value?.length ?? 0) > 0
    || (assigneeFilters.value?.length ?? 0) > 0
    || (priorityFilters.value?.length ?? 0) > 0
  )

  const openCards = computed(() => {
    return allCards.value.filter(c => c.statusId !== doneStatusId.value).length
  })

  // Card detail modal
  const showCardDetail = ref(false)
  const selectedCard = ref<BaseCard | null>(null)

  function openCardDetail(card: { id: number }) {
    const fullCard = allCards.value.find(c => c.id === card.id)
    if (fullCard) {
      selectedCard.value = fullCard
    }
    showCardDetail.value = true
  }

  // Create card modal
  const showCreateCard = ref(false)

  async function handleCreateCard(data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }) {
    const newCard = await createCard(data.statusId, data.title, {
      description: data.description || undefined,
      priority: data.priority,
      assigneeId: data.assigneeId || undefined,
      dueDate: data.dueDate || undefined
    })
    if (data.tagIds?.length && newCard) {
      await updateCardTags((newCard as { id: number }).id, data.tagIds)
    }
    showCreateCard.value = false
  }

  async function handleUpdateCard(cardId: number, updates: Record<string, unknown>, tagIds?: string[]) {
    await updateCard(cardId, updates as Partial<BaseCard>)
    if (tagIds !== undefined) {
      await updateCardTags(cardId, tagIds)
    }
    if (selectedCard.value?.id === cardId) {
      const found = allCards.value.find(c => c.id === cardId)
      selectedCard.value = found ?? null
    }
  }

  async function handleDeleteCard(cardId: number) {
    await deleteCard(cardId)
    showCardDetail.value = false
    selectedCard.value = null
  }

  return {
    activeTagFilters,
    isFiltered,
    openCards,
    showCardDetail,
    selectedCard,
    openCardDetail,
    showCreateCard,
    handleCreateCard,
    handleUpdateCard,
    handleDeleteCard
  }
}
