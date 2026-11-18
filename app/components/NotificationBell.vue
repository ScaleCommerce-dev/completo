<script setup lang="ts">
/**
 * The topbar bell, at every width, directly left of the account menu (handoff
 * `03` › Topbar). It was a sidebar row from `lg` up and this bell below, so
 * the feature moved when the window was resized; the sidebar holds areas you
 * work in, not signals. The fallback poll lives in the layout, which never
 * remounts.
 */
const { unreadCount } = useUnreadCount()

/**
 * What a screen reader hears. The button held an icon and a bare count, and the
 * tooltip is not a name, so it was announced as "link, 3" and then "button".
 */
const label = computed(() => unreadCount.value > 0 ? `Notifications, ${unreadCount.value} unread` : 'Notifications')
</script>

<template>
  <UTooltip :text="unreadCount > 0 ? `${unreadCount} unread` : 'Notifications'">
    <!-- One control, a link: `UButton` with `to` renders the `<a>` itself. It was
         a button inside a `NuxtLink`, which is invalid nesting and two tab stops.

         36px square, the guideline's icon button (handoff `04` › Buttons),
         and the height of the search field and account button beside it in
         the topbar: the global 44px minimum made it the tallest thing there. -->
    <UButton
      to="/notifications"
      variant="ghost"
      color="neutral"
      class="relative notification-bell min-h-9 min-w-9 justify-center p-0"
      square
      :aria-label="label"
    >
      <!-- size-5: a child icon sizes from the button's font, not from its
           theme's icon slot, so it has to be told what `leadingIcon` is. -->
      <UIcon
        name="i-lucide-bell"
        class="size-5"
        :class="{ 'bell-ring': unreadCount > 0 }"
      />
      <!-- The brand fill, `bg-accent` with its own text colour. `bg-primary` is the
           text-safe accent, a light pink in the always-dark shell, so white on it
           was about 2:1. -->
      <span
        v-if="unreadCount > 0"
        aria-hidden="true"
        class="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent text-on-accent text-2xs font-bold leading-none px-0.5 shadow-raise ring-2 ring-bg"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </UButton>
  </UTooltip>
</template>
