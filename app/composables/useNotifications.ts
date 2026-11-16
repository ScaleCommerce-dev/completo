interface Notification {
  id: string
  type: 'card_assigned' | 'member_added' | 'role_changed' | 'member_removed' | 'mentioned'
  title: string
  message: string
  linkUrl: string | null
  projectId: string | null
  cardId: number | null
  readAt: string | null
  createdAt: string
  actorName: string | null
  actorAvatarUrl: string | null
  actorId: string | null
  actorKind: 'human' | 'agent' | null
  actorColor: string | null
  actorManagedBy: { id: string, name: string, avatarUrl: string | null } | null
}

/** The key of the list fetch, so the stream can refresh the list where it is shown. */
export const NOTIFICATIONS_LIST_KEY = 'notifications-list'

/**
 * The unread count alone: the sidebar, the bell and the stream need nothing else.
 *
 * It used to come with the whole list, from one `useFetch` the layout mounted at
 * app load and never unmounted. That key then sat at `status === 'success'`, and
 * Nuxt does not refetch a key in that state when the page calls it again, so the
 * Notifications page showed the list from app load: the badge said 1 and a toast
 * appeared, but the new notification was not on the page. It also downloaded the
 * whole list on every app load for a number.
 */
export function useUnreadCount() {
  const { data, refresh: refreshUnreadCount } = useFetch<{ count: number }>('/api/notifications/unread-count', { key: 'notifications-unread-count' })
  const unreadCount = computed(() => data.value?.count ?? 0)
  return { unreadCount, refreshUnreadCount }
}

/** The list, for the Notifications page. */
export function useNotifications() {
  const { mutate, toast } = useMutation()

  const { data: notifications, refresh: refreshNotifications, status } = useFetch<Notification[]>('/api/notifications', { key: NOTIFICATIONS_LIST_KEY })
  const { unreadCount, refreshUnreadCount } = useUnreadCount()
  // A second visit finds the key already loaded, which Nuxt does not refetch.
  onMounted(() => {
    if (status.value === 'success') refreshNotifications()
  })

  const items = computed(() => notifications.value || [])

  function refresh() {
    refreshNotifications()
    refreshUnreadCount()
  }

  async function markAsRead(id: string) {
    try {
      await mutate(
        () => $fetch(`/api/notifications/${id}`, { method: 'PATCH' }),
        'Failed to mark notification as read'
      )
    } catch {
      // error already toasted
    }
    refresh()
  }

  async function markAllRead() {
    try {
      await mutate(
        () => $fetch('/api/notifications/mark-all-read', { method: 'POST' }),
        'Failed to mark all as read'
      )
    } catch {
      // error already toasted
    }
    refresh()
  }

  async function cleanup() {
    try {
      await mutate(
        () => $fetch('/api/notifications/cleanup', { method: 'DELETE' }),
        'Failed to clean up notifications'
      )
      refresh()
      toast.add({ title: 'Read notifications cleaned up', color: 'success' })
    } catch {
      // error already toasted
    }
  }

  return {
    notifications: items,
    unreadCount,
    status,
    refresh,
    refreshUnreadCount,
    markAsRead,
    markAllRead,
    cleanup
  }
}
