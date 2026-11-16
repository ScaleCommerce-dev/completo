<script setup lang="ts">
/**
 * The header bell, below `lg` only: from `lg` up, notifications are a sidebar
 * row (see `ui/Page.vue`). The fallback poll moved to the layout with them.
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

         `md` and square, the size of every page action beside it (New project,
         Settings). It was `xs`, a 20px box with a 12px glyph next to 32px
         buttons with 20px glyphs, and the navbar's right edge stepped in height
         from one control to the next. -->
    <UButton
      to="/notifications"
      variant="ghost"
      color="neutral"
      class="relative notification-bell"
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
