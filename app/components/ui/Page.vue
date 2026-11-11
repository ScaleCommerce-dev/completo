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

/** The same measures as `WIDTHS`, for the navbar to end where the body does. */
const MEASURES = {
  narrow: 'var(--container-2xl)',
  default: 'var(--container-5xl)',
  wide: 'var(--container-7xl)'
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
      <!-- On a document page the navbar's controls end where the body column
           ends. The bar spans the panel and the body is capped and left-aligned,
           so on a wide screen Settings sat a few hundred pixels past the right
           edge of everything it configures. The border still runs full width:
           it divides chrome from page, it doesn't frame the content. -->
      <UDashboardNavbar
        :class="variant === 'document' ? 'page-navbar' : undefined"
        :style="variant === 'document' ? { '--page-measure': MEASURES[width] } : undefined"
        :title="title"
        :ui="{ title: 'text-base font-extrabold tracking-heading text-highlighted' }"
      >
        <!-- No UDashboardSidebarToggle here: UDashboardNavbar renders its own via
             the `toggle` prop, and adding one produced two hamburgers on mobile. -->
        <template
          v-if="$slots.leading"
          #leading
        >
          <slot name="leading" />
        </template>

        <!-- Title and description share one row. The description is the first
             thing to go on a narrow screen — it explains, it doesn't identify. -->
        <template
          v-if="$slots.title || $slots['title-trailing'] || description"
          #title
        >
          <slot name="title">
            <span class="flex items-baseline gap-2.5 min-w-0">
              <span class="text-base font-extrabold tracking-heading text-highlighted shrink-0">{{ title }}</span>
              <!-- What belongs to the record rather than to the page, such as a
                   project's star. Beside the name, not in `#right`: there, a
                   chip and a toggle sat among page actions at three heights and
                   read as actions themselves. Baseline-aligned like the
                   description, so text here sits on the title's line; a control
                   centres itself. -->
              <span
                v-if="$slots['title-trailing']"
                class="flex items-baseline gap-1.5 shrink-0"
              >
                <slot name="title-trailing" />
              </span>
              <span
                v-if="description"
                class="text-sm text-muted truncate max-lg:hidden"
              >{{ description }}</span>
            </span>
          </slot>
        </template>

        <!-- Everything here belongs to the page. Notifications are the signed-in
             person's and live in the sidebar; in this row they sat between a
             project's members and its Settings and read as the project's own.
             Below `lg` the sidebar is behind the menu button, so the bell comes
             back, last — after the page's actions, at the edge, where nothing
             of the page's follows it. -->
        <template #right>
          <slot name="meta" />
          <slot name="actions" />
          <!-- Wrapped: the bell's root is a UTooltip, which renders no element of its own to take a class. -->
          <span class="flex lg:hidden">
            <NotificationBell />
          </span>
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

<style>
/* End padding = panel width − body gutter − measure, so the right-hand controls
   line up with the body column's right edge; never less than the navbar's own
   gutter. The gutters are the navbar's `px-4 sm:px-6`, which match the body's
   `p-4 sm:p-6`. Unlayered, so this wins over the theme's `px-*` utility. Not
   scoped: the navbar root renders through a Reka `Primitive` inside the panel's
   slot and never receives this file's scope attribute. */
.page-navbar {
  padding-inline-end: max(1rem, calc(100% - var(--page-measure) - 1rem));
}
@media (min-width: 40rem) {
  .page-navbar {
    padding-inline-end: max(1.5rem, calc(100% - var(--page-measure) - 1.5rem));
  }
}
</style>
