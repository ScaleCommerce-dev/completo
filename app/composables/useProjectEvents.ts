import type { BaseCard } from '~/types/card'

interface ProjectEventHandlers {
  onCardUpsert: (card: BaseCard) => void
  onCardDelete: (id: number) => void
  /** A comment landed on a card: `{ id, actorId }`, for the live unread dot. */
  onCardActivity: (activity: { id: number, actorId: string }) => void
  /** Structural change (statuses, columns, filters, tags): refetch to catch up. */
  onViewInvalidate: () => void
}

/**
 * One connection per project, shared by everything on the page that follows it.
 *
 * A board follows its project, and so does the card panel's history, which
 * also has to follow it where nothing else does (My Tasks, the card page).
 * Opening a stream per caller would hold two per board tab, and over HTTP/1.1 a
 * browser allows six connections to a host across all its tabs, the
 * notification stream included. So callers subscribe to a shared channel, and
 * the last one to leave closes it.
 */
interface Channel {
  source: EventSource
  subscribers: Set<ProjectEventHandlers>
  reconnecting: boolean
}

const channels = new Map<string, Channel>()

function openChannel(id: string): Channel {
  const es = new EventSource(`/api/events?projectId=${encodeURIComponent(id)}`)
  const channel: Channel = { source: es, subscribers: new Set(), reconnecting: false }

  // Each subscriber separately, so one that throws cannot starve the rest.
  const each = (call: (h: ProjectEventHandlers) => void) => {
    for (const h of [...channel.subscribers]) {
      try {
        call(h)
      } catch {
        // A subscriber's own failure is not the stream's.
      }
    }
  }

  es.addEventListener('card.upsert', (e) => {
    let card: BaseCard
    try {
      card = JSON.parse((e as MessageEvent).data) as BaseCard
    } catch {
      return // A malformed frame is not worth tearing the stream down for.
    }
    each(h => h.onCardUpsert(card))
  })

  es.addEventListener('card.delete', (e) => {
    try {
      const { id: cardId } = JSON.parse((e as MessageEvent).data) as { id: number }
      if (typeof cardId === 'number') each(h => h.onCardDelete(cardId))
    } catch {
      // ignore
    }
  })

  es.addEventListener('card.activity', (e) => {
    try {
      const a = JSON.parse((e as MessageEvent).data) as { id: number, actorId: string }
      if (typeof a?.id === 'number' && typeof a?.actorId === 'string') each(h => h.onCardActivity(a))
    } catch {
      // ignore
    }
  })

  es.addEventListener('view.invalidate', () => each(h => h.onViewInvalidate()))

  es.onopen = () => {
    if (channel.reconnecting) {
      channel.reconnecting = false
      each(h => h.onViewInvalidate())
    }
  }

  // EventSource reconnects itself; just record that a gap happened so the next
  // successful open refetches.
  es.onerror = () => {
    channel.reconnecting = true
  }

  channels.set(id, channel)
  return channel
}

/**
 * Subscribe to a project's live update stream: a board or list, or the card
 * panel's history.
 *
 * Joins the shared `EventSource` to `/api/events` for the project id the getter
 * returns (opening it if nobody has yet), moving if that id changes (it is null on
 * first render, then resolves once the view GET lands) and leaving when the owning
 * component unmounts. Taking a
 * getter rather than a `Ref` sidesteps the `ComputedRef`→`Ref` variance mismatch
 * and is exactly what `watch` wants. The session cookie authenticates the
 * connection; nothing else is needed here.
 *
 * Two things worth stating:
 *
 * - **Reconnect implies a gap.** `EventSource` retries a dropped connection on its
 *   own, but events that fired while it was down are gone — this bus keeps no
 *   backlog (see `server/utils/events.ts`). So the first successful open *after* an
 *   error triggers `onViewInvalidate`, i.e. a refetch, to resynchronise. The very
 *   first open does not: the initial GET already has the current state.
 * - **Guarded to the browser.** `EventSource` is absent under SSR and in the
 *   node-based unit runner, so the whole composable no-ops off the client rather
 *   than throwing there.
 */
export function useProjectEvents(
  projectId: () => string | null | undefined,
  handlers: ProjectEventHandlers
): void {
  if (!import.meta.client || typeof EventSource === 'undefined') return

  let joined: string | null = null

  function close() {
    if (!joined) return
    const channel = channels.get(joined)
    channel?.subscribers.delete(handlers)
    if (channel && !channel.subscribers.size) {
      channel.source.close()
      channels.delete(joined)
    }
    joined = null
  }

  function open(id: string) {
    close()
    const channel = channels.get(id) ?? openChannel(id)
    channel.subscribers.add(handlers)
    joined = id
  }

  watch(projectId, (id) => {
    if (id) open(id)
    else close()
  }, { immediate: true })

  onScopeDispose(close)
}
