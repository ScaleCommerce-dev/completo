<script setup lang="ts">
import type { CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import { matchSegments } from '#shared/utils/card-search'

/**
 * The app shell.
 *
 * This used to provide a sidebar and nothing else, so every page hand-built its
 * own header and five different idioms evolved — a full-bleed bar, a
 * `p-6 max-w-Nxl` document block, a centred form, a breadcrumb row, and (on the
 * profile page) no title at all. `NotificationBell` was a per-page duty placed
 * five different ways across nine files.
 *
 * Pages now render `<UiPage>`, which owns the navbar. Everything global —
 * notifications, search, the user menu — lives here, once.
 */
const { navSections, paletteItems } = useNavigation()
const colorMode = useColorMode()
const logout = useSignOut()
// The app's half of the sign-in / sign-out timeline (`useAuthTransition`).
const { phase: authPhase } = useAuthTransition()

// Live notifications for the whole session — opened here (persistent across
// navigations) rather than in NotificationBell, which remounts per page.
useNotificationStream()

/**
 * The unread count rides on the sidebar's Notifications row. The 30s poll is the
 * stream's fallback (see `useNotificationStream`) and lives here because the
 * sidebar is the one place that never remounts.
 */
const { unreadCount, refreshUnreadCount } = useNotifications()
let unreadPoll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  unreadPoll = setInterval(refreshUnreadCount, 30000)
})
onUnmounted(() => clearInterval(unreadPoll))

const sidebarCollapsed = useCookie<boolean>('sidebar-collapsed', { default: () => false })
const route = useRoute()

/**
 * Which row is active: the one whose address is the longest prefix of the
 * current path. A starred project stays lit on its own boards and cards, and a
 * project that is not starred lights All Projects — one row, never two.
 *
 * Nuxt UI's own matching is exact, so on a board *no* row was lit. The
 * guideline's alternative — the area marked as an ancestor with the opened
 * project inserted beneath it — was built and removed: it put a second copy of
 * a starred project under All Projects, so clicking a star moved the highlight
 * away from the row you clicked. Recorded in `docs/connect2scale.md`.
 */
const activeTo = computed(() => {
  const all = navSections.value.flatMap(s => s.items.map(i => i.to))
  const hits = all.filter(to => route.path === to || route.path.startsWith(`${to}/`))
  return hits.sort((a, b) => b.length - a.length)[0]
})

function withActive(items: NavigationMenuItem[]): NavigationMenuItem[] {
  return items.map(item => ({ ...item, active: item.to === activeTo.value }))
}

/** `slot` routes the row to `#notifications-leading`, which hangs the collapsed rail's dot. */
const sidebarSections = computed(() => navSections.value.map(section => ({
  ...section,
  items: withActive(section.items.map(item => item.to === '/notifications'
    ? {
        ...item,
        slot: 'notifications',
        badge: unreadCount.value > 0
          ? { label: unreadCount.value > 99 ? '99+' : String(unreadCount.value), color: 'primary' as const, variant: 'soft' as const }
          : undefined
      }
    : item))
})))

/**
 * The sliding active indicator (handoff `06-motion.md` › Navigationsindikator):
 * one fill per group that travels to the active entry. Measured after each
 * render that can move it; a group animates only when it already had an
 * indicator, so the first placement — and a jump into another group — is
 * instant rather than a flight. `main.css` › "The sliding indicator".
 */
function placeIndicators() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  for (const group of document.querySelectorAll<HTMLElement>('.c2s-shell .nav-group')) {
    const active = group.querySelector<HTMLElement>('[data-slot="link"][data-active]')
    if (!active) {
      delete group.dataset.indicator
      delete group.dataset.animate
      continue
    }
    const g = group.getBoundingClientRect()
    const a = active.getBoundingClientRect()
    if ('indicator' in group.dataset && !reduce) group.dataset.animate = ''
    else delete group.dataset.animate
    // The entry's own fill is inset 1px top and bottom (`before:inset-y-px`).
    group.style.setProperty('--nav-y', `${a.top - g.top + 1}px`)
    group.style.setProperty('--nav-h', `${a.height - 2}px`)
    group.dataset.indicator = ''
  }
}
watch([() => route.fullPath, sidebarSections, sidebarCollapsed], () => {
  nextTick(() => requestAnimationFrame(placeIndicators))
}, { flush: 'post' })
onMounted(() => {
  requestAnimationFrame(placeIndicators)
  window.addEventListener('resize', placeIndicators)
})
onUnmounted(() => window.removeEventListener('resize', placeIndicators))

/** The three states `UColorModeButton` cycles, as command-palette rows. */
const COLOR_MODES = [
  { value: 'system', label: 'System theme', icon: 'i-lucide-monitor' },
  { value: 'light', label: 'Light theme', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark theme', icon: 'i-lucide-moon' }
] as const

/**
 * Command palette contents. There was previously no global search anywhere, and
 * the sidebar's project list was flat, unsearchable and unbounded — with thirty
 * projects it simply got long.
 *
 * Two of the three groups are fixed lists the palette filters client-side with
 * its own fuse pass. Cards cannot be: there are as many as the instance holds,
 * and the whole point is finding one you cannot see. They come from
 * `/api/cards/search` instead — see `useCardSearch`.
 *
 * Boards and lists are still deliberately absent: `/api/projects` returns
 * counts, not the views themselves, and widening a documented API response is
 * out of scope for a UI change. Reaching a board is project → view, one hop.
 */
const searchOpen = ref(false)
const searchTerm = ref('')
const { results: cardHits, loading: searchingCards } = useCardSearch(searchTerm)

const searchGroups = computed(() => [
  {
    id: 'go',
    label: 'Go to',
    // Every project, not the sidebar's starred few — see `paletteItems`.
    items: paletteItems.value.map(i => ({
      label: i.label,
      icon: i.icon,
      to: i.to
    }))
  },
  /**
   * Cards come from the server already filtered, so `ignoreFilter` stops the
   * palette's fuse pass from filtering them a second time against its own
   * notion of a match — which drops rows that matched on the description,
   * since the description is not in the item.
   *
   * The group disappears rather than showing "no cards" when there are none:
   * the palette is also how you reach a project or run an action, and an empty
   * section pushes both of those below the fold on every keystroke.
   */
  ...(cardHits.value.length
    ? [{
        id: 'cards',
        label: 'Cards',
        ignoreFilter: true,
        // Routes these rows to the `#card-*` slots below, which mark the query
        // inside the title. `ignoreFilter` means the palette's fuse pass never
        // runs on them, so its own `labelHtml` highlighting never arrives —
        // and it would not be usable here anyway, since that prop takes a
        // string of markup and card titles are whatever someone typed.
        slot: 'card',
        items: cardHits.value.map(c => ({
          // The ticket id leads, because it is the handle people quote to each
          // other; the project name trails, because it is what disambiguates
          // two cards called "Fix the header" in different projects.
          prefix: formatTicketId(c.projectKey, c.id),
          label: c.title,
          suffix: c.projectName,
          icon: 'i-lucide-square-kanban',
          to: `/projects/${c.projectSlug}/cards/${formatTicketId(c.projectKey, c.id)}`,
          // Rides along so the highlight handler can find the card again. The
          // palette hands the whole item back as the listbox value, minus a
          // fixed set of internal keys, so anything else on it survives.
          cardId: c.id
        }))
      }]
    : []),
  {
    id: 'actions',
    label: 'Actions',
    items: [
      { label: 'New project', icon: 'i-lucide-plus', to: '/projects/new' },
      { label: 'My profile', icon: 'i-lucide-user', to: '/profile' },
      {
        label: sidebarCollapsed.value ? 'Expand sidebar' : 'Collapse sidebar',
        icon: sidebarCollapsed.value ? 'i-lucide-chevron-right' : 'i-lucide-chevron-left',
        onSelect: () => { sidebarCollapsed.value = !sidebarCollapsed.value }
      },
      { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }
    ]
  },
  /**
   * `UDashboardSearch` appends this group itself when it renders its own
   * content. Composing the palette in the `#content` slot means composing this
   * too — without it, taking over the layout would silently remove the theme
   * switch from the palette, which is the kind of loss nothing reports.
   */
  {
    id: 'theme',
    label: 'Theme',
    items: COLOR_MODES.map(mode => ({
      label: mode.label,
      icon: mode.icon,
      active: colorMode.preference === mode.value,
      onSelect: () => { colorMode.preference = mode.value }
    }))
  }
])

/**
 * Which row the selection is on, so the preview pane can show it.
 *
 * Reka's `ListboxRoot` emits `highlight` with the collection entry whose
 * `value` is the palette item — `UCommandPalette` spreads `$attrs` onto that
 * root, so the listener reaches it. Anything that is not a card (a project, an
 * action, a theme) yields no id, and the pane falls back to its resting state.
 */
const highlightedCardId = ref<number | null>(null)
const highlightedCard = computed(() =>
  cardHits.value.find(c => c.id === highlightedCardId.value) || null)

function onSearchHighlight(payload?: { ref: HTMLElement, value: CommandPaletteItem }) {
  // `CommandPaletteItem` is an open shape, so `cardId` — which only the card
  // rows carry — is not on the declared type.
  highlightedCardId.value = (payload?.value as { cardId?: number } | undefined)?.cardId ?? null
}

/**
 * Navigation is the item's own `to`, via the link the palette wraps it in —
 * this only has to shut the dialog and clear the query, which is what
 * `UDashboardSearch` does for its own content.
 */
function onSearchSelect(item?: { disabled?: boolean }) {
  if (item?.disabled) return
  searchOpen.value = false
  searchTerm.value = ''
}

// A stale query behind a closed palette means the next ⌘K opens on the last
// search, and `useCardSearch` would still be holding its results.
watch(searchOpen, (open) => {
  if (!open) {
    searchTerm.value = ''
    highlightedCardId.value = null
  }
})
</script>

<template>
  <UDashboardGroup
    unit="px"
    storage-key="c2s-dashboard"
    :data-auth-phase="authPhase"
  >
    <!-- `unit="px"` lives on the group: Nuxt UI sizes the sidebar in the
         *group's* unit and ignores one passed to the sidebar, which rendered the
         64px rail as 64% of the window. A fresh `storage-key`, because the old
         one holds a saved size of 17 that would now read as 17px. -->
    <!-- The skip link (handoff `04-komponenten.md` › Skip-Link): the first
         focusable thing on every page, landing on `UiPage`'s content area. -->
    <a
      href="#content"
      class="skip-link"
    >Skip to content</a>

    <!--
      The shell (handoff `03-layout-navigation.md`): always dark, in both
      themes — `dark c2s-shell` on the root and on the mobile menu's content,
      which is portaled and would otherwise miss it. A fixed 224px rather than
      the resizable percentage it was: the guideline fixes the width (204px
      under 1150px, 64px collapsed), and a sidebar that resizes per person is
      a shell that differs per person.
    -->
    <UDashboardSidebar
      v-model:collapsed="sidebarCollapsed"
      collapsible
      :default-size="224"
      :min-size="224"
      :max-size="224"
      :collapsed-size="64"
      class="dark c2s-shell"
      :ui="{
        root: 'c2s-sidebar border-e-0 z-10',
        content: 'dark c2s-shell',
        header: 'h-auto pt-5 pb-3',
        body: 'gap-1 px-3',
        footer: 'px-3 py-3'
      }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/projects"
          class="flex items-center gap-2.5 min-w-0"
          :class="collapsed ? 'justify-center w-full' : ''"
        >
          <!-- The product logo, 28px tall (handoff › Sidebar). Its tile is the
               connect2scale brand gradient — the one brand moment in the shell. -->
          <span class="brand-tile flex items-center justify-center size-7 rounded-lg shrink-0">
            <img
              src="/completo-icon.svg"
              alt=""
              class="size-5 invert"
            >
          </span>
          <span
            v-if="!collapsed"
            class="flex flex-col min-w-0"
          >
            <!-- 0.16em is the sidebar wordmark's own letterspacing — one file,
                 one use, deliberately not a token. -->
            <span class="text-2xs font-semibold text-dimmed tracking-[0.16em] uppercase leading-none">Drag. Drop.</span>
            <span class="sidebar-brand font-extrabold text-base leading-none text-highlighted mt-1">Completo</span>
          </span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <!-- Its own `kbds` prop renders ⌘ as a character, and no font on any
             platform we checked carries ⌘, ↵, ← and → together — so the glyph
             came from a system fallback and looked different in every browser.
             The `#trailing` slot replaces them with drawn keys. See UiKey. -->
        <UDashboardSearchButton
          :collapsed="collapsed"
          variant="outline"
        >
          <template #trailing>
            <UiKey
              value="meta"
              variant="subtle"
            />
            <UiKey
              value="k"
              variant="subtle"
            />
          </template>
        </UDashboardSearchButton>

        <template
          v-for="(section, i) in sidebarSections"
          :key="i"
        >
          <UiSectionLabel
            v-if="section.label && !collapsed && (section.items.length || section.empty)"
            :label="section.label"
            class="px-2.5 pt-1.5"
          />
          <UNavigationMenu
            v-if="section.items.length"
            :items="section.items"
            :collapsed="collapsed"
            :tooltip="collapsed"
            orientation="vertical"
            class="nav-group"
            :ui="{ link: 'font-medium' }"
          >
            <!-- Collapsed, the rail has no room for the count badge, so unread
                 shows as a dot on the glyph instead. -->
            <template #notifications-leading="{ item, ui, active }">
              <UChip
                :show="collapsed && unreadCount > 0"
                size="sm"
                inset
              >
                <UIcon
                  :name="(item as NavigationMenuItem).icon!"
                  :class="ui.linkLeadingIcon({ active })"
                />
              </UChip>
            </template>
          </UNavigationMenu>
          <!--
            An empty section says how to fill it rather than vanishing — as a
            caption under its heading, not as a row. Dressed as a nav link in dim
            grey it read as a disabled destination, and its star as some
            project's icon; a dashed slot was tried next and read as a content
            tile (the empty board column, the New Project card) that had wandered
            into the sidebar, which only speaks in rows and labels. So: plain
            text from the heading's left edge, no box and no icon column.

            The copy names the control by its look, with the same glyph inline,
            so you know what to find on a card or in a project's header — and
            uses no verb of its own, so it holds under whatever the section is
            called. `text-muted`, not `dimmed`: this is a sentence to be read.
            `text-balance` keeps the last word from sitting alone. Still a link
            to All Projects, where the stars are. Not in the collapsed rail:
            there is no room for a sentence.
          -->
          <NuxtLink
            v-else-if="section.empty && !collapsed"
            :to="section.empty.to"
            class="block px-2.5 pt-0.5 pb-1.5 text-xs leading-relaxed text-balance text-muted hover:text-highlighted transition-colors"
          >
            Click
            <UIcon
              name="i-lucide-star"
              class="size-3.5 align-[-0.15em]"
            />
            on any project to add it here.
          </NuxtLink>
        </template>
      </template>

      <!--
        The collapse switch, at the sidebar's foot and at least 44px tall
        (handoff › Sidebar). It used to straddle the sidebar's right edge; the
        shell has no divider there now — the content area's rounded corner is
        the seam — so a control on it would float over nothing. The account
        menu and theme switch that lived here moved to the topbar with every
        other global action.
      -->
      <template #footer="{ collapsed }">
        <UDashboardSidebarCollapse
          :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          :label="collapsed ? undefined : 'Collapse'"
          color="neutral"
          variant="ghost"
          :square="collapsed"
          class="min-h-11"
          :class="collapsed ? 'justify-center w-full' : 'w-full'"
        />
      </template>
    </UDashboardSidebar>

    <!--
      title/description are passed explicitly: the installed @nuxt/ui locale
      has no `dashboardSearch.title` or `.description` key, so the defaults
      render as the literal translation keys in the dialog.

      The z-index is the fix for a real stacking bug, not caution. Nuxt UI gives
      no overlay a z-index at all — dialogs stack by their order in `<body>`,
      and a portal is inserted where its *anchor* sits, which is fixed when the
      component mounts. This palette lives in the layout, so its anchor is
      created before any page's; opening the card panel and then hitting ⌘K put
      the palette *underneath* the panel, half of it clipped by the panel's edge
      and the rest dimmed by the panel's own overlay. Both slots need it: the
      overlay must cover the panel for the same reason the content must.

      50 rather than a bigger number so it stays legible next to Tailwind's own
      `z-50` scale step; `stacking.test.ts` fails if anything in the app outbids
      it, which is the only way this can regress.
    -->
    <UDashboardSearch
      v-model:open="searchOpen"
      v-model:search-term="searchTerm"
      title="Search"
      description="Jump to a card, project, or command"
      placeholder="Search cards, projects and actions..."
      :loading="searchingCards"
      :groups="searchGroups"
      class="palette-on-top"
      :ui="{ modal: 'sm:max-w-5xl!' }"
    >
      <!--
        The palette is composed here rather than left to `UDashboardSearch`
        because the preview pane has to sit *beside* the list, and the component
        lays its own content out as a column: input, then results, then footer.
        Taking the modal's `#content` slot is what allows a row.

        Everything below reproduces what `UDashboardSearch` renders by default,
        with two additions: `@highlight`, which is how the pane learns which row
        the selection is on (Reka's ListboxRoot emits it, and `UCommandPalette`
        spreads `$attrs` onto that root), and closing on select, which the
        default content does for us and this one has to do itself.

        `sm:max-w-5xl!` above widens the dialog from `UDashboardSearch`'s own
        `sm:max-w-3xl` — 48rem leaves ~35 characters of title once the pane
        takes its share, so the pane would be paid for out of the list. The `!`
        is deliberate: two `max-w-*` utilities on one element are otherwise
        resolved by `@theme` declaration order rather than by what is written
        (see CLAUDE.md), and `!` makes the winner declared.
      -->
      <template #content>
        <div class="flex min-h-0 flex-1">
          <UCommandPalette
            v-model:search-term="searchTerm"
            :groups="searchGroups"
            :loading="searchingCards"
            placeholder="Search cards, projects and actions..."
            :input="{ fixed: true }"
            close
            class="command-palette flex-1 min-w-0"
            @update:model-value="onSearchSelect"
            @update:open="searchOpen = $event"
            @highlight="onSearchHighlight"
          >
            <!-- Same three parts the default label renders — prefix, label,
                 suffix — with the matched words marked. Segments rather than
                 the palette's `labelHtml`, so no markup is ever built out of a
                 card title. See `matchSegments`. -->
            <template #card-label="{ item }">
              <span class="card-id text-muted shrink-0">{{ item.prefix }}</span>
              <span class="text-highlighted">
                <span
                  v-for="(seg, i) in matchSegments(String(item.label), searchTerm)"
                  :key="i"
                  :class="seg.match ? SEARCH_MARK_CLASS : ''"
                >{{ seg.text }}</span>
              </span>
              <span class="text-dimmed">{{ item.suffix }}</span>
            </template>
          </UCommandPalette>

          <!-- Below `lg` the dialog is the width of the screen and the pane
               would leave the list unreadable, so the palette is exactly what
               it was before. -->
          <CardSearchPreview
            :card="highlightedCard"
            :query="searchTerm"
            class="hidden lg:flex"
          />
        </div>
      </template>
    </UDashboardSearch>

    <slot />
  </UDashboardGroup>
</template>
