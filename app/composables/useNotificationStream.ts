interface NotificationEvent {
  id: string
  notificationType: string
  title: string
  message: string
  linkUrl: string | null
}

/**
 * Live notifications for the signed-in user.
 *
 * Opens one `EventSource('/api/notifications/stream')` for the session and, on
 * each pushed notification, refreshes the bell's unread count and raises a toast.
 * Meant to be called once from the persistent app shell (`layouts/default.vue`)
 * so it survives page navigation rather than reconnecting on every route change.
 *
 * The 30s poll in `NotificationBell` stays as the fallback: if this connection
 * drops, the count still catches up within a poll interval. Guarded to the
 * browser (`EventSource` is absent under SSR / the node test runner) and to a
 * signed-in session.
 */
export function useNotificationStream(): void {
  if (!import.meta.client || typeof EventSource === 'undefined') return

  const { user } = useUserSession()
  const { refreshUnreadCount } = useNotifications()
  const toast = useToast()

  let source: EventSource | null = null

  function close() {
    source?.close()
    source = null
  }

  function open() {
    close()
    const es = new EventSource('/api/notifications/stream')
    source = es

    es.addEventListener('notification', (e) => {
      let n: NotificationEvent
      try {
        n = JSON.parse((e as MessageEvent).data) as NotificationEvent
      } catch {
        return
      }
      // The count is authoritative from the server; the toast is the immediate cue.
      refreshUnreadCount()
      toast.add({
        title: n.title,
        description: n.message,
        icon: 'i-lucide-bell',
        color: 'info',
        ...(n.linkUrl ? { actions: [{ label: 'View', to: n.linkUrl }] } : {})
      })
    })
  }

  // Track the session: connect while signed in, drop the socket on logout.
  watch(() => user.value?.id, (id) => {
    if (id) open()
    else close()
  }, { immediate: true })

  onScopeDispose(close)
}
