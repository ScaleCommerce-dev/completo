<script setup lang="ts">
/**
 * The one page shell.
 *
 * Before this, five chrome idioms coexisted: a full-bleed bar
 * (`px-5 py-2.5 border-b backdrop-blur-sm`), a `p-6 max-w-Nxl` document block
 * with an h1/p pair, a centred form, a `max-w-[1080px]` breadcrumb row, and the
 * profile page, whose entire header was a right-aligned notification bell with no
 * title at all. Container widths ran max-w-5xl / 3xl / [1080px] / [640px] /
 * [520px] / full-bleed; header bottom margins ran mb-2 / mb-5 / mb-6 / mb-8; and
 * page titles came in six type treatments.
 *
 * Two body contracts replace four:
 *
 *   document — the page scrolls, centred and padded. Settings, admin, profile.
 *   surface  — the child owns its own scroll and bleeds to the edges. Board, list.
 *
 * That also settles scroll ownership, which used to be ambiguous: pages declared
 * `h-full overflow-y-auto` *inside* an already-scrolling panel.
 */
withDefaults(defineProps<{
  title?: string
  description?: string
  /** Body layout. See the note above. */
  variant?: 'document' | 'surface'
  /** Reading width for `document`. `wide` suits card grids, `narrow` suits forms. */
  width?: 'narrow' | 'default' | 'wide'
}>(), {
  variant: 'document',
  width: 'default'
})

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl'
}
</script>

<template>
  <UDashboardPanel
    :ui="{
      body: variant === 'surface'
        ? 'p-0 gap-0 overflow-hidden'
        : 'p-4 sm:p-6 gap-4 sm:gap-6'
    }"
  >
    <template #header>
      <UDashboardNavbar
        :title="title"
        :ui="{ title: 'text-base font-extrabold tracking-[-0.02em] text-highlighted' }"
      >
        <template #leading>
          <UDashboardSidebarToggle />
          <slot name="leading" />
        </template>

        <!-- Title and description share one row. The description is the first
             thing to go on a narrow screen — it explains, it doesn't identify. -->
        <template
          v-if="$slots.title || description"
          #title
        >
          <slot name="title">
            <span class="flex items-baseline gap-2.5 min-w-0">
              <span class="text-base font-extrabold tracking-[-0.02em] text-highlighted shrink-0">{{ title }}</span>
              <span
                v-if="description"
                class="text-sm text-muted truncate max-lg:hidden"
              >{{ description }}</span>
            </span>
          </slot>
        </template>

        <template #right>
          <slot name="meta" />
          <NotificationBell />
          <slot name="actions" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="$slots.toolbar">
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Left-aligned, not centred: the navbar title sits at the left edge, and a
           centred body under a left-aligned title reads as a misalignment. -->
      <div
        v-if="variant === 'document'"
        class="w-full flex flex-col gap-4 sm:gap-6"
        :class="WIDTHS[width]"
      >
        <slot />
      </div>
      <slot v-else />
    </template>
  </UDashboardPanel>
</template>
