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
interface Crumb {
  label: string
  to?: string
}

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  /** Body layout. See the note above. */
  variant?: 'document' | 'surface'
  /** Reading width for `document`. `wide` suits card grids, `narrow` suits forms. */
  width?: 'narrow' | 'default' | 'wide'
  /**
   * The topbar breadcrumb's ancestors — everything before the current page.
   * Defaults to the top-level section the route sits in; the current page's own
   * crumb is the title, appended when there is one.
   */
  crumbs?: Crumb[]
}>(), {
  variant: 'document',
  width: 'default',
  crumbs: undefined
})

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl'
}

/**
 * The top-level section each first path segment belongs to — the root of the
 * breadcrumb when a page names no ancestors of its own. The labels are the
 * sidebar's, so the breadcrumb and the active sidebar row always agree.
 */
const SECTIONS: Record<string, Crumb> = {
  'projects': { label: 'All Projects', to: '/projects' },
  'my-tasks': { label: 'My Tasks', to: '/my-tasks' },
  'notifications': { label: 'Notifications', to: '/notifications' },
  'agents': { label: 'Agents', to: '/agents' },
  'admin': { label: 'Admin' },
  'profile': { label: 'Profile', to: '/profile' }
}

const route = useRoute()
const trail = computed<Crumb[]>(() => {
  const ancestors = props.crumbs ?? [SECTIONS[route.path.split('/')[1] ?? '']].filter((c): c is Crumb => !!c)
  // A section's own index page (All Projects at `/projects`) is the section:
  // its title would only repeat the crumb in other words.
  const last = ancestors.at(-1)
  if (last?.to === route.path) return ancestors
  return props.title?.trim() && props.title !== last?.label
    ? [...ancestors, { label: props.title }]
    : ancestors
})
</script>

<template>
  <!--
    The connect2scale shell (handoff `03-layout-navigation.md`):

      ┌ topbar ─ breadcrumb ················· bell · theme │ account ┐  shell, always dark
      ╭ content ─────────────────────────────────────────────────────┤  canvas, rounded top-left
      │ page header  h1 26px · description ············ meta · actions│
      │ toolbar                                                       │
      │ body                                                          │

    The navbar *is* the topbar, so it carries what belongs to every page —
    where you are, and the global actions. Everything that belongs to *this*
    page — its title, its record's trailing controls, its actions — moved down
    into the page header inside the content area, where the guideline puts it.

    `UDashboardPanel`'s default slot replaces its header/body pair, because the
    content area has to wrap the page header, the toolbar *and* the body in one
    rounded canvas, and the panel's own body slot only reaches the last of them.
  -->
  <UDashboardPanel :ui="{ root: 'c2s-panel bg-shell lg:not-last:border-e-0' }">
    <UDashboardNavbar
      class="dark c2s-shell"
      :ui="{ root: 'border-b-0 min-h-topbar h-auto', right: 'gap-2' }"
    >
      <template #left>
        <nav
          aria-label="Breadcrumb"
          class="min-w-0"
        >
          <ol class="flex items-center gap-1.5 text-xs min-w-0">
            <li
              v-for="(crumb, i) in trail"
              :key="i"
              class="flex items-center gap-1.5 min-w-0"
              :class="i < trail.length - 1 ? 'max-md:hidden' : ''"
            >
              <UIcon
                v-if="i > 0"
                name="i-lucide-chevron-right"
                class="size-3.5 text-dimmed shrink-0"
              />
              <NuxtLink
                v-if="crumb.to && i < trail.length - 1"
                :to="crumb.to"
                class="truncate text-muted hover:text-highlighted transition-colors"
              >{{ crumb.label }}</NuxtLink>
              <span
                v-else
                class="truncate"
                :class="i === trail.length - 1 ? 'font-medium text-highlighted' : 'text-muted'"
                :aria-current="i === trail.length - 1 ? 'page' : undefined"
              >{{ crumb.label }}</span>
            </li>
          </ol>
        </nav>
      </template>

      <template #right>
        <!-- Below `lg` the sidebar is behind the menu button, so the bell
             comes back here. Wrapped: the bell's root is a UTooltip, which
             renders no element of its own to take a class. -->
        <span class="flex lg:hidden">
          <NotificationBell />
        </span>
        <ThemeSwitch />
        <span
          class="h-5.5 w-px bg-accented"
          aria-hidden="true"
        />
        <AccountMenu />
      </template>
    </UDashboardNavbar>

    <div
      id="content"
      class="c2s-content flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      <!--
        The page header. Spacing groups what belongs together, tightest first:
          icon → name       10px  one identity
          name → trailing    0    the star is a property of the name; the
                                  button's own padding leaves ~6px to its glyph
          name → description  4px under it, one block
      -->
      <header
        class="content-gutter flex flex-wrap items-center justify-between gap-x-4 gap-y-3"
        :class="[variant === 'document' ? WIDTHS[width] : '', variant === 'surface' || $slots.toolbar ? 'page-head' : '']"
      >
        <div class="flex flex-1 items-center gap-2.5 min-w-0">
          <slot name="leading" />
          <div class="flex flex-1 flex-col gap-1 min-w-0">
            <div class="flex items-center min-w-0">
              <!-- Not `truncate` on the heading itself: a page may put an
                   editable title here (the card page), whose focus line the
                   clipping would cut off. The plain title truncates instead. -->
              <h1
                class="text-2xl font-extrabold text-highlighted min-w-0"
                :class="$slots['title-trailing'] ? '' : 'flex-1'"
              >
                <slot name="title">
                  <span class="block truncate">{{ title }}</span>
                </slot>
              </h1>
              <!-- What belongs to the record rather than to the page, such as a
                   project's star. -->
              <slot name="title-trailing" />
            </div>
            <!-- A slot as well as a prop: a page whose record edits its own
                 description in place (the agent page) puts the field here. -->
            <slot name="description">
              <p
                v-if="description"
                class="text-sm text-muted truncate"
              >
                {{ description }}
              </p>
            </slot>
          </div>
        </div>

        <div
          v-if="$slots.meta || $slots.actions"
          class="flex items-center gap-2 shrink-0"
        >
          <slot name="meta" />
          <slot name="actions" />
        </div>
      </header>

      <!-- The toolbar belongs to the page header (handoff › Seitentypen ›
           Übersicht: header, then toolbar, then content) — it stays put while
           the body scrolls, and it draws no rule of its own: the 30px gaps
           either side do the separating. -->
      <UDashboardToolbar
        v-if="$slots.toolbar"
        class="content-gutter-x"
        :ui="{ root: 'border-b-0 min-h-0 py-0 overflow-visible' }"
      >
        <slot name="toolbar" />
      </UDashboardToolbar>

      <!-- Left-aligned, not centred: the title sits at the left edge, and a
           centred body under a left-aligned title reads as a misalignment. -->
      <div
        v-if="variant === 'document'"
        class="c2s-scroll flex-1 overflow-y-auto thin-scroll"
      >
        <!-- The 30px under the page header lives *inside* the scroller here,
             as padding, not as the header's margin. A sticky element (the card
             page's property rail, Profile's section nav) measures its `top`
             from the scroller's edge, so with the gap outside, its offset
             pushed it down at rest — but only where its row was taller than
             it and left room to move: a card with a long description was
             16px out of line with its rail, a short one was not. -->
        <div
          class="content-gutter-x content-gutter-bottom page-body-start w-full flex flex-col gap-4 sm:gap-6"
          :class="WIDTHS[width]"
        >
          <slot />
        </div>
      </div>
      <div
        v-else
        class="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        <slot />
      </div>
    </div>
  </UDashboardPanel>
</template>
