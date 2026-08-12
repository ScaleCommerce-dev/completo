<script setup lang="ts">
definePageMeta({ layout: 'default' })

const router = useRouter()
const {
  notifications,
  unreadCount,
  markAsRead,
  markAllRead,
  cleanup
} = useNotifications()

const notificationIcon: Record<string, string> = {
  card_assigned: 'i-lucide-check-square',
  member_added: 'i-lucide-user-plus',
  role_changed: 'i-lucide-shield',
  member_removed: 'i-lucide-user-minus',
  mentioned: 'i-lucide-at-sign'
}

const notificationIconColor: Record<string, string> = {
  card_assigned: '#6366f1',
  member_added: '#10b981',
  role_changed: '#f59e0b',
  member_removed: '#ef4444',
  mentioned: '#06b6d4'
}

const notificationIconBg: Record<string, string> = {
  card_assigned: 'bg-primary/10',
  member_added: 'bg-success/10',
  role_changed: 'bg-warning/10',
  member_removed: 'bg-error/10',
  mentioned: 'bg-info/10'
}

// Group notifications by date
const grouped = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string, items: typeof notifications.value }[] = []
  const todayItems: typeof notifications.value = []
  const yesterdayItems: typeof notifications.value = []
  const thisWeekItems: typeof notifications.value = []
  const olderItems: typeof notifications.value = []

  for (const n of notifications.value) {
    const d = new Date(n.createdAt)
    if (d >= today) todayItems.push(n)
    else if (d >= yesterday) yesterdayItems.push(n)
    else if (d >= weekAgo) thisWeekItems.push(n)
    else olderItems.push(n)
  }

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems })
  if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems })
  if (thisWeekItems.length) groups.push({ label: 'This Week', items: thisWeekItems })
  if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems })
  return groups
})

async function handleClick(notification: { id: string, readAt: string | null, linkUrl: string | null }) {
  if (!notification.readAt) {
    await markAsRead(notification.id)
  }
  if (notification.linkUrl) {
    router.push(notification.linkUrl)
  }
}

const hasRead = computed(() => notifications.value.some(n => n.readAt))
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header bar -->
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-default bg-default/60 backdrop-blur-sm">
      <div class="flex items-center gap-2.5">
        <h1 class="text-base font-extrabold tracking-[-0.02em] text-highlighted">
          Notifications
        </h1>
        <span
          v-if="unreadCount > 0"
          class="inline-flex items-center gap-1 text-xs font-semibold text-primary"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          {{ unreadCount }} unread
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <UButton
          v-if="unreadCount > 0"
          icon="i-lucide-check-check"
          label="Mark all read"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="markAllRead"
        />
        <UTooltip text="Delete all read notifications">
          <UButton
            v-if="hasRead"
            icon="i-lucide-trash-2"
            label="Clean up"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="cleanup"
          />
        </UTooltip>
      </div>
    </div>

    <!-- Notification groups -->
    <div class="flex-1 overflow-auto p-4 flex flex-col gap-5">
      <div
        v-for="(group, gi) in grouped"
        :key="group.label"
      >
        <!-- Group label -->
        <div class="flex items-center gap-2 mb-2 px-1">
          <span class="text-xs font-semibold uppercase tracking-[0.08em] text-dimmed">
            {{ group.label }}
          </span>
          <div class="flex-1 h-px bg-elevated" />
          <span class="text-xs font-mono text-dimmed tabular-nums">
            {{ group.items.length }}
          </span>
        </div>

        <!-- Notification cards -->
        <div class="rounded-xl border border-default overflow-hidden divide-y divide-default">
          <button
            v-for="(n, ni) in group.items"
            :key="n.id"
            class="rise-in w-full text-left px-4 py-3 flex items-start gap-3 transition-all duration-150"
            :class="[
              n.readAt
                ? 'bg-white bg-muted hover:bg-muted'
                : 'bg-primary/5 hover:bg-primary/15 hover:bg-primary/20'
            ]"
            :style="{ animationDelay: `${gi * 60 + ni * 40}ms` }"
            @click="handleClick(n)"
          >
            <!-- Unread indicator -->
            <div class="w-2 flex-shrink-0 mt-3.5">
              <div
                v-if="!n.readAt"
                class="w-2 h-2 rounded-full bg-indigo-500"
              />
            </div>

            <!-- Actor avatar or type icon -->
            <div class="relative flex-shrink-0 mt-0.5">
              <!-- Avatar with icon overlay -->
              <div
                v-if="n.actorAvatarUrl"
                class="w-8 h-8 rounded-full ring-2 ring-[var(--ui-bg)] overflow-hidden"
              >
                <img
                  :src="n.actorAvatarUrl"
                  :alt="n.actorName || ''"
                  class="w-full h-full object-cover"
                >
              </div>
              <div
                v-else-if="n.actorName"
                class="w-8 h-8 rounded-full ring-2 ring-[var(--ui-bg)] bg-gradient-to-br from-indigo-400 via-violet-400 to-purple-500 flex items-center justify-center"
              >
                <span class="text-xs font-bold text-white/90 leading-none select-none">
                  {{ n.actorName.charAt(0).toUpperCase() }}
                </span>
              </div>
              <div
                v-else
                class="w-8 h-8 rounded-full flex items-center justify-center"
                :class="notificationIconBg[n.type] || 'bg-elevated'"
              >
                <UIcon
                  :name="notificationIcon[n.type] || 'i-lucide-bell'"
                  class="text-base"
                  :style="{ color: notificationIconColor[n.type] || '#71717a' }"
                />
              </div>
              <!-- Type badge on avatar -->
              <div
                v-if="n.actorName"
                class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-[var(--ui-bg)]"
                :class="notificationIconBg[n.type] || 'bg-elevated'"
              >
                <UIcon
                  :name="notificationIcon[n.type] || 'i-lucide-bell'"
                  class="text-2xs"
                  :style="{ color: notificationIconColor[n.type] || '#71717a' }"
                />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p
                class="text-sm leading-snug text-default"
                :class="{ 'font-semibold': !n.readAt }"
              >
                {{ n.message }}
              </p>
              <p class="text-xs text-dimmed mt-1">
                {{ relativeTime(n.createdAt) }}
              </p>
            </div>

            <!-- Link arrow -->
            <UIcon
              v-if="n.linkUrl"
              name="i-lucide-chevron-right"
              class="text-base text-dimmed flex-shrink-0 mt-1"
            />
          </button>
        </div>
      </div>

      <UEmpty
        v-if="!notifications.length"
        class="py-16"
        icon="i-lucide-bell-off"
        title="No notifications"
        description="Mentions, assignments and membership changes land here."
      />
    </div>
  </div>
</template>
