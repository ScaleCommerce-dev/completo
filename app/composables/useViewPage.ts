import type { BaseCard } from '~/types/card'
import { filterCards, hasActiveFilters, countActiveFilters, buildFilterSummary } from '~/utils/card-filters'
import type { CardFilterState } from '~/utils/card-filters'

interface ViewPageOptions<T extends BaseCard = BaseCard> {
  allCards: ComputedRef<T[]>
  tagFilters: ComputedRef<string[]>
  statusFilters: ComputedRef<string[]>
  assigneeFilters: ComputedRef<string[]>
  priorityFilters: ComputedRef<string[]>
  statuses: ComputedRef<{ id: string, name: string }[]>
  members: ComputedRef<{ id: string, name: string }[]>
  tags: ComputedRef<{ id: string, name: string }[]>
  updateCardTags: (cardId: number, tagIds: string[]) => Promise<void>
  createCard: (statusId: string, title: string, opts?: { description?: string, priority?: string, assigneeId?: string, dueDate?: string | null }) => Promise<unknown>
  updateCard: (cardId: number, updates: Partial<BaseCard>) => Promise<unknown>
  deleteCard: (cardId: number) => Promise<void>
}

export function useViewPage<T extends BaseCard = BaseCard>(opts: ViewPageOptions<T>) {
  const {
    allCards,
    tagFilters,
    statusFilters,
    assigneeFilters,
    priorityFilters,
    statuses,
    members,
    tags: tagsData,
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

  const filterState = computed<CardFilterState>(() => ({
    statusIds: statusFilters.value || [],
    priorities: priorityFilters.value || [],
    assigneeIds: assigneeFilters.value || [],
    tagIds: activeTagFilters.value
  }))

  const isFiltered = computed(() => hasActiveFilters(filterState.value))

  function applyFilters<C extends BaseCard>(cards: C[]): C[] {
    return filterCards(cards, filterState.value) as C[]
  }

  const filteredCards = computed<T[]>(() => applyFilters(allCards.value))

  const visibleCardCount = computed(() => filteredCards.value.length)

  const activeFilterCount = computed(() => countActiveFilters(filterState.value))

  const filterSummary = computed(() => buildFilterSummary(filterState.value, {
    statuses: statuses.value,
    members: members.value,
    tags: tagsData.value
  }))

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

  async function createCardFromFormData(data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }): Promise<number> {
    const newCard = await createCard(data.statusId, data.title, {
      description: data.description || undefined,
      priority: data.priority,
      assigneeId: data.assigneeId || undefined,
      dueDate: data.dueDate || undefined
    })
    const cardId = (newCard as { id: number }).id
    if (data.tagIds?.length) {
      await updateCardTags(cardId, data.tagIds)
    }
    return cardId
  }

  async function ensureCardForDraft(data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }): Promise<number> {
    return createCardFromFormData(data)
  }

  async function handleCreateCard(data: { title: string, description: string, priority: string, statusId: string, assigneeId: string | null, tagIds: string[], dueDate: string | null }) {
    await createCardFromFormData(data)
    showCreateCard.value = false
  }

  async function deleteDraftCard(cardId: number) {
    await deleteCard(cardId)
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
    applyFilters,
    filteredCards,
    visibleCardCount,
    activeFilterCount,
    filterSummary,
    showCardDetail,
    selectedCard,
    openCardDetail,
    showCreateCard,
    ensureCardForDraft,
    handleCreateCard,
    handleUpdateCard,
    handleDeleteCard,
    deleteDraftCard
  }
}
