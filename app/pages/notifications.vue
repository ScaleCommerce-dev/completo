<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Notifications · Completo' })

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

// Token classes, not hex: the previous values were single-valued across both
// themes, and the '#71717a' fallback for an unknown type was a fixed mid-grey.
const notificationIconTone: Record<string, string> = {
  card_assigned: 'text-primary',
  member_added: 'text-success',
  role_changed: 'text-warning',
  member_removed: 'text-error',
  mentioned: 'text-info'
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
  <UiPage
    title="Notifications"
    variant="surface"
  >
    <template #meta>
      <UBadge
        v-if="unreadCount > 0"
        :label="`${unreadCount} unread`"
        color="primary"
        variant="subtle"
      />
    </template>

    <template #actions>
      <UButton
        v-if="unreadCount > 0"
        icon="i-lucide-check-check"
        label="Mark all read"
        variant="ghost"
        color="neutral"
        @click="markAllRead"
      />
      <UTooltip text="Delete every notification you have already read">
        <UButton
          v-if="hasRead"
          icon="i-lucide-trash-2"
          label="Clean up"
          variant="ghost"
          color="neutral"
          @click="cleanup"
        />
      </UTooltip>
    </template>

    <!-- Notification groups -->
    <div class="flex-1 overflow-auto p-4 flex flex-col gap-5">
      <div
        v-for="(group, gi) in grouped"
        :key="group.label"
      >
        <!-- Group label -->
        <div class="flex items-center gap-2 mb-2 px-1">
          <span class="text-xs font-semibold uppercase tracking-label text-dimmed">
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
            class="rise-in w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-150"
            :class="[
              n.readAt
                ? 'bg-default hover:bg-muted'
                : 'bg-primary/5 hover:bg-primary/15'
            ]"
            :style="{ animationDelay: `${gi * 60 + ni * 40}ms` }"
            @click="handleClick(n)"
          >
            <!-- Unread indicator -->
            <div class="w-2 flex-shrink-0 mt-3.5">
              <div
                v-if="!n.readAt"
                class="w-2 h-2 rounded-full bg-primary"
              />
            </div>

            <!-- Who did it, with what kind of event badged on the corner. The
                 initials fallback was a hand-rolled gradient circle; UAvatar
                 already resolves src-or-initials, and the brand gradient is
                 reserved for the logo and the drag. -->
            <div class="relative shrink-0 mt-0.5">
              <UiAvatar
                v-if="n.actorName"
                :src="n.actorAvatarUrl || undefined"
                :alt="n.actorName"
                size="sm"
                class="ring-2 ring-bg"
              />
              <span
                v-else
                class="flex items-center justify-center size-8 rounded-full"
                :class="notificationIconBg[n.type] || 'bg-elevated'"
              >
                <UIcon
                  :name="notificationIcon[n.type] || 'i-lucide-bell'"
                  class="text-base"
                  :class="notificationIconTone[n.type] || 'text-dimmed'"
                />
              </span>

              <span
                v-if="n.actorName"
                class="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full ring-2 ring-bg"
                :class="notificationIconBg[n.type] || 'bg-elevated'"
              >
                <UIcon
                  :name="notificationIcon[n.type] || 'i-lucide-bell'"
                  class="text-2xs"
                  :class="notificationIconTone[n.type] || 'text-dimmed'"
                />
              </span>
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
  </UiPage>
</template>
