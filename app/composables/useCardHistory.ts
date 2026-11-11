import type { CardHistoryEvent } from '~/utils/card-history'

interface HistoryPage {
  events: CardHistoryEvent[]
  /** Backwards reads: older entries remain. Forward (`after`) reads: newer ones do. */
  hasMore: boolean
  /** Every entry the card has, the creation included, however many are loaded. */
  total: number
  /** The card's project, whose live stream says when to read again. */
  projectId: string
}

/** A first page that covers nearly every card; a busy one pages back from here. */
const PAGE = 100
/** The server's cap on one read. */
const MAX = 500

/**
 * The open card's history, kept current while it is shown.
 *
 * Until `wanted` (the Comments tab is showing), it reads only the count the
 * Activity tab shows (`limit=1`); the first page loads when changes are asked
 * for. After that, a change reads only what is newer than the newest entry
 * shown (`after`) and appends it, so nothing already shown drops out: not the
 * creation at the top, not pages read with "Show earlier changes".
 *
 * It listens on the card's project stream itself, so every host of the panel
 * (board, list, My Tasks, the card page) sees every actor's changes, its own
 * included, because the server's `card.upsert` follows every change to a card.
 * `useProjectEvents` shares one connection per project, so on a board this is
 * the board's stream, not a second one.
 */
export function useCardHistory(cardId: Ref<number | null | undefined>, wanted: Ref<boolean>) {
  const events = ref<CardHistoryEvent[]>([])
  const hasMore = ref(false)
  const total = ref<number | null>(null)
  const loading = ref(false)
  const loadingEarlier = ref(false)
  const projectId = ref<string | null>(null)

  // Whether `events` holds the newest page and everything since: the point
  // from which only newer entries need reading.
  let loaded = false
  // Bumped per card. Each read checks it when it lands and is dropped if the
  // panel has moved on; reads for the same card never discard one another,
  // because each merges by id into whatever is there by then.
  let generation = 0

  const read = (id: number, query: Record<string, number>) =>
    $fetch<HistoryPage>(`/api/cards/${id}/history`, { query })

  async function refresh() {
    const id = cardId.value
    if (!id) return
    const mine = generation
    try {
      if (!loaded && !wanted.value) {
        const page = await read(id, { limit: 1 })
        if (mine !== generation) return
        total.value = page.total
        projectId.value = page.projectId
        return
      }
      if (!loaded) {
        loading.value = true
        const page = await read(id, { limit: PAGE })
        if (mine !== generation) return
        if (loaded) {
          // Another read got here first; keep whatever this one has that is newer.
          const newest = events.value.at(-1)?.id ?? -1
          events.value = [...events.value, ...page.events.filter(e => e.id > newest)]
          return
        }
        events.value = page.events
        hasMore.value = page.hasMore
        total.value = page.total
        projectId.value = page.projectId
        loaded = true
        return
      }
      for (let more = true; more;) {
        const page = await read(id, { after: events.value.at(-1)?.id ?? 0, limit: MAX })
        if (mine !== generation) return
        const newest = events.value.at(-1)?.id ?? -1
        events.value = [...events.value, ...page.events.filter(e => e.id > newest)]
        total.value = page.total
        more = page.hasMore && page.events.length > 0
      }
    } catch {
      // Silent, like the comments: the card may have just been deleted.
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  async function loadEarlier() {
    const id = cardId.value
    const oldest = events.value[0]
    if (!id || !oldest || !hasMore.value || loadingEarlier.value) return
    const mine = generation
    loadingEarlier.value = true
    try {
      const page = await read(id, { limit: PAGE, before: oldest.id })
      if (mine !== generation) return
      const first = events.value[0]?.id ?? Infinity
      events.value = [...page.events.filter(e => e.id < first), ...events.value]
      hasMore.value = page.hasMore
      total.value = page.total
    } catch {
      // Leave the button for another try.
    } finally {
      if (mine === generation) loadingEarlier.value = false
    }
  }

  // Coalesce a burst (an agent's five changes) into one read.
  let timer: ReturnType<typeof setTimeout> | null = null
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, 150)
  }
  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  useProjectEvents(() => projectId.value, {
    onCardUpsert(card) {
      if (card.id === cardId.value) schedule()
    },
    // Nothing here: a deleted card's history goes with it, and comments are the
    // comment list's.
    onCardDelete: () => {},
    onCardActivity: () => {},
    // A deleted status or tag, or a removed member, adds history to cards the
    // event does not name, and a reconnect means events were missed.
    onViewInvalidate: schedule
  })

  watch(cardId, () => {
    generation++
    loaded = false
    events.value = []
    hasMore.value = false
    total.value = null
    loading.value = false
    loadingEarlier.value = false
    void refresh()
  }, { immediate: true })

  watch(wanted, (isWanted) => {
    if (isWanted && !loaded) void refresh()
  })

  return { events, hasMore, total, loading, loadingEarlier, loadEarlier }
}
