import type { BaseCard } from '~/types/card'

interface ProjectEventHandlers {
  onCardUpsert: (card: BaseCard) => void
  onCardDelete: (id: number) => void
  /** Structural change (statuses, columns, filters, tags): refetch to catch up. */
  onViewInvalidate: () => void
}

/**
 * Subscribe a board or list to its project's live update stream.
 *
 * Opens an `EventSource` to `/api/events` for the project id the getter returns,
 * reopening it if that id changes (it is null on first render, then resolves once
 * the view GET lands) and closing it when the owning component unmounts. Taking a
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

  let source: EventSource | null = null
  let reconnecting = false

  function close() {
    source?.close()
    source = null
  }

  function open(id: string) {
    close()
    reconnecting = false
    const es = new EventSource(`/api/events?projectId=${encodeURIComponent(id)}`)
    source = es

    es.addEventListener('card.upsert', (e) => {
      try {
        handlers.onCardUpsert(JSON.parse((e as MessageEvent).data) as BaseCard)
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    })

    es.addEventListener('card.delete', (e) => {
      try {
        const { id: cardId } = JSON.parse((e as MessageEvent).data) as { id: number }
        if (typeof cardId === 'number') handlers.onCardDelete(cardId)
      } catch {
        // ignore
      }
    })

    es.addEventListener('view.invalidate', () => handlers.onViewInvalidate())

    es.onopen = () => {
      if (reconnecting) {
        reconnecting = false
        handlers.onViewInvalidate()
      }
    }

    // EventSource reconnects itself; just record that a gap happened so the next
    // successful open refetches.
    es.onerror = () => {
      reconnecting = true
    }
  }

  watch(projectId, (id) => {
    if (id) open(id)
    else close()
  }, { immediate: true })

  onScopeDispose(close)
}
