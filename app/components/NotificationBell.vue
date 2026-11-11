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
    <!-- `flex`: an inline link adds a line box around the button, which made
         the link 24px tall around a 20px button and shifted it off-centre. -->
    <NuxtLink
      to="/notifications"
      class="flex"
    >
      <!-- `md` and square, the size of every page action beside it (New
           project, Settings). It was `xs` — a 20px box with a 12px glyph next to
           32px buttons with 20px glyphs — and the navbar's right edge stepped
           in height from one control to the next. -->
      <UButton
        variant="ghost"
        color="neutral"
        class="relative notification-bell"
        square
      >
        <!-- size-5: a child icon sizes from the button's font, not from its
             theme's icon slot, so it has to be told what `leadingIcon` is. -->
        <UIcon
          name="i-lucide-bell"
          class="size-5"
          :class="{ 'bell-ring': unreadCount > 0 }"
        />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-white text-2xs font-bold leading-none px-0.5 shadow-raise ring-2 ring-bg"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </UButton>
    </NuxtLink>
  </UTooltip>
</template>
