<script setup lang="ts">
import type { CommandPaletteItem } from '@nuxt/ui'
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
const { user, clear } = useUserSession()
const { navSections } = useNavigation()
const router = useRouter()
const colorMode = useColorMode()

// Live notifications for the whole session — opened here (persistent across
// navigations) rather than in NotificationBell, which remounts per page.
useNotificationStream()

/** The three states `UColorModeButton` cycles, as command-palette rows. */
const COLOR_MODES = [
  { value: 'system', label: 'System theme', icon: 'i-lucide-monitor' },
  { value: 'light', label: 'Light theme', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark theme', icon: 'i-lucide-moon' }
] as const

const sidebarCollapsed = useCookie<boolean>('sidebar-collapsed', { default: () => false })

async function logout() {
  await $fetch('/auth/logout', { method: 'POST' })
  await clear()
  await router.push('/login')
}

const userMenuItems = computed(() => [
  [{
    label: user.value?.name || 'Account',
    type: 'label' as const
  }],
  [{
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/profile'
  }, {
    label: 'API docs',
    icon: 'i-lucide-book-open',
    onSelect: () => window.open('/api/docs', '_blank')
  }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: logout
  }]
])

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
    items: navSections.value.flatMap(s => s.items).map(i => ({
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
  <UDashboardGroup>
    <UDashboardSidebar
      v-model:collapsed="sidebarCollapsed"
      collapsible
      resizable
      :min-size="14"
      :default-size="17"
      :max-size="26"
      :ui="{ root: 'overflow-visible z-10', header: 'relative overflow-visible', footer: 'border-t border-default gap-1' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/projects"
          class="flex items-center gap-2.5 min-w-0"
          :class="collapsed ? 'justify-center w-full' : ''"
        >
          <!-- The logo is one of only three places the brand gradient appears. -->
          <span class="flex items-center justify-center size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-raise shrink-0">
            <img
              src="/completo-icon.svg"
              alt=""
              class="size-[22px] invert"
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

        <!--
          On the seam, not in the header. The panel-left glyph next to the
          wordmark competed with the logo and read as a second brand mark.
          A chevron on the divider is the old Completo control and the one
          Linear/Notion trained people to look for.

          The seam is the same seam in both states. Collapsed, this used `right-1`,
          which tucks the chevron *inside* the 64px rail — landing on top of the
          right half of the logo tile, which is the only other thing in the header
          at that width. Straddling the divider is the whole idea of the control,
          so it does that whether the sidebar is 300px or 64px wide; the sidebar
          root and header are already `overflow-visible` for exactly this.

          Wrapped: UButton's theme is `relative`, which wins a class-merge
          against `absolute` on the button itself.
        -->
        <span class="absolute top-1/2 right-0 z-20 -translate-y-1/2 translate-x-1/2">
          <UDashboardSidebarCollapse
            :icon="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-left'"
            size="xs"
            color="neutral"
            variant="outline"
            square
            class="size-6 rounded-full bg-default shadow-raise hover:bg-elevated"
          />
        </span>
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
          v-for="(section, i) in navSections"
          :key="i"
        >
          <UiSectionLabel
            v-if="section.label && !collapsed"
            :label="section.label"
            class="px-2.5 pt-1.5"
          />
          <UNavigationMenu
            :items="section.items"
            :collapsed="collapsed"
            :tooltip="collapsed"
            orientation="vertical"
            :ui="{ link: 'font-medium' }"
          />
        </template>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="userMenuItems"
          :content="{ align: 'start', side: 'top' }"
          class="min-w-0"
          :class="collapsed ? '' : 'flex-1'"
        >
          <UButton
            :label="collapsed ? undefined : (user?.name || 'Account')"
            variant="ghost"
            color="neutral"
            class="w-full"
            :class="collapsed ? 'justify-center' : 'justify-start'"
            :ui="{ label: 'truncate' }"
          >
            <template #leading>
              <UiAvatar
                :src="user?.avatarUrl || undefined"
                :alt="user?.name || 'Account'"
                size="2xs"
              />
            </template>
          </UButton>
        </UDropdownMenu>

        <!-- Reachable when collapsed too. This was `v-if="!collapsed"`, so
             collapsing the sidebar hid the only theme switch in the app. -->
        <UColorModeButton
          variant="ghost"
          color="neutral"
          class="shrink-0"
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
            class="flex-1 min-w-0"
            @update:model-value="onSearchSelect"
            @update:open="searchOpen = $event"
            @highlight="onSearchHighlight"
          >
            <!-- Same three parts the default label renders — prefix, label,
                 suffix — with the matched words marked. Segments rather than
                 the palette's `labelHtml`, so no markup is ever built out of a
                 card title. See `matchSegments`. -->
            <template #card-label="{ item }">
              <span class="text-default shrink-0">{{ item.prefix }}</span>
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
