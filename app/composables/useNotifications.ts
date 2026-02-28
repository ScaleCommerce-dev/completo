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
}

export function useNotifications() {
  const { mutate, toast } = useMutation()

  const { data: notifications, refresh: refreshNotifications, status } = useFetch<Notification[]>('/api/notifications')
  const { data: unreadData, refresh: refreshUnreadCount } = useFetch<{ count: number }>('/api/notifications/unread-count')

  const items = computed(() => notifications.value || [])
  const unreadCount = computed(() => unreadData.value?.count ?? 0)

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
