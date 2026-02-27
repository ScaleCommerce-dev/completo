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
  const toast = useToast()

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
      await $fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      refresh()
    } catch (e) {
      toast.add({ title: 'Failed to mark notification as read', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
  }

  async function markAllRead() {
    try {
      await $fetch('/api/notifications/mark-all-read', { method: 'POST' })
      refresh()
    } catch (e) {
      toast.add({ title: 'Failed to mark all as read', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    }
  }

  async function cleanup() {
    try {
      await $fetch('/api/notifications/cleanup', { method: 'DELETE' })
      refresh()
      toast.add({ title: 'Read notifications cleaned up', color: 'success' })
    } catch (e) {
      toast.add({ title: 'Failed to clean up notifications', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
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
