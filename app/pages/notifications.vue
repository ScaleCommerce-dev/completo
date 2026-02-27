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
  card_assigned: 'bg-indigo-50 dark:bg-indigo-500/10',
  member_added: 'bg-emerald-50 dark:bg-emerald-500/10',
  role_changed: 'bg-amber-50 dark:bg-amber-500/10',
  member_removed: 'bg-red-50 dark:bg-red-500/10',
  mentioned: 'bg-cyan-50 dark:bg-cyan-500/10'
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
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
      <div class="flex items-center gap-2.5">
        <h1 class="text-[15px] font-extrabold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
          Notifications
        </h1>
        <span
          v-if="unreadCount > 0"
          class="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-500 dark:text-indigo-400"
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
          <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
            {{ group.label }}
          </span>
          <div class="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          <span class="text-[11px] font-mono text-zinc-300 dark:text-zinc-600 tabular-nums">
            {{ group.items.length }}
          </span>
        </div>

        <!-- Notification cards -->
        <div class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/80">
          <button
            v-for="(n, ni) in group.items"
            :key="n.id"
            class="notification-row w-full text-left px-4 py-3 flex items-start gap-3 transition-all duration-150"
            :class="[
              n.readAt
                ? 'bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                : 'bg-indigo-50/30 dark:bg-indigo-950/10 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20'
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
                class="w-8 h-8 rounded-full ring-2 ring-white dark:ring-zinc-800 overflow-hidden"
              >
                <img
                  :src="n.actorAvatarUrl"
                  :alt="n.actorName || ''"
                  class="w-full h-full object-cover"
                >
              </div>
              <div
                v-else-if="n.actorName"
                class="w-8 h-8 rounded-full ring-2 ring-white dark:ring-zinc-800 bg-gradient-to-br from-indigo-400 via-violet-400 to-purple-500 flex items-center justify-center"
              >
                <span class="text-[12px] font-bold text-white/90 leading-none select-none">
                  {{ n.actorName.charAt(0).toUpperCase() }}
                </span>
              </div>
              <div
                v-else
                class="w-8 h-8 rounded-full flex items-center justify-center"
                :class="notificationIconBg[n.type] || 'bg-zinc-100 dark:bg-zinc-800'"
              >
                <UIcon
                  :name="notificationIcon[n.type] || 'i-lucide-bell'"
                  class="text-[14px]"
                  :style="{ color: notificationIconColor[n.type] || '#71717a' }"
                />
              </div>
              <!-- Type badge on avatar -->
              <div
                v-if="n.actorName"
                class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-zinc-900"
                :class="notificationIconBg[n.type] || 'bg-zinc-100 dark:bg-zinc-800'"
              >
                <UIcon
                  :name="notificationIcon[n.type] || 'i-lucide-bell'"
                  class="text-[8px]"
                  :style="{ color: notificationIconColor[n.type] || '#71717a' }"
                />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p
                class="text-[13px] leading-snug text-zinc-700 dark:text-zinc-300"
                :class="{ 'font-semibold': !n.readAt }"
              >
                {{ n.message }}
              </p>
              <p class="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                {{ relativeTime(n.createdAt) }}
              </p>
            </div>

            <!-- Link arrow -->
            <UIcon
              v-if="n.linkUrl"
              name="i-lucide-chevron-right"
              class="text-[14px] text-zinc-300 dark:text-zinc-600 flex-shrink-0 mt-1"
            />
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="!notifications.length"
        class="flex flex-col items-center justify-center py-20"
      >
        <div class="relative mb-5">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-800/50 flex items-center justify-center shadow-sm border border-zinc-200/50 dark:border-zinc-700/30">
            <UIcon
              name="i-lucide-bell-off"
              class="text-[28px] text-zinc-300 dark:text-zinc-600"
            />
          </div>
          <div class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <UIcon
              name="i-lucide-check"
              class="text-[10px] text-emerald-500"
            />
          </div>
        </div>
        <p class="font-bold text-zinc-900 dark:text-zinc-100 tracking-[-0.01em]">
          All caught up!
        </p>
        <p class="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
          No notifications to show right now.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-row {
  animation: notification-enter 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
}

@keyframes notification-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
