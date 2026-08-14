<script setup lang="ts">
const { unreadCount, refreshUnreadCount } = useNotifications()

const unreadPoll = ref<ReturnType<typeof setInterval>>()
onMounted(() => {
  unreadPoll.value = setInterval(refreshUnreadCount, 30000)
})
onUnmounted(() => {
  if (unreadPoll.value) clearInterval(unreadPoll.value)
})
</script>

<template>
  <UTooltip :text="unreadCount > 0 ? `${unreadCount} unread` : 'Notifications'">
    <NuxtLink to="/notifications">
      <UButton
        variant="ghost"
        color="neutral"
        class="relative notification-bell"
        size="xs"
      >
        <UIcon
          name="i-lucide-bell"
          :class="{ 'bell-ring': unreadCount > 0 }"
        />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-white text-2xs font-bold leading-none px-0.5 shadow-raise ring-1.5 ring-bg"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </UButton>
    </NuxtLink>
  </UTooltip>
</template>
