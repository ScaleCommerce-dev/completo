<script setup lang="ts">
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
 * Boards and lists are deliberately absent: `/api/projects` returns counts, not
 * the views themselves, and widening a documented API response is out of scope
 * for a UI change. Reaching a board is project → view, one hop.
 */
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
  {
    id: 'actions',
    label: 'Actions',
    items: [
      { label: 'New project', icon: 'i-lucide-plus', to: '/projects/new' },
      { label: 'My profile', icon: 'i-lucide-user', to: '/profile' },
      {
        label: sidebarCollapsed.value ? 'Expand sidebar' : 'Collapse sidebar',
        icon: 'i-lucide-panel-left',
        onSelect: () => { sidebarCollapsed.value = !sidebarCollapsed.value }
      },
      { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }
    ]
  }
])
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
      :ui="{ footer: 'border-t border-default gap-1' }"
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
            <span class="text-2xs font-semibold text-dimmed tracking-[0.16em] uppercase leading-none">Drag. Drop.</span>
            <span class="sidebar-brand font-extrabold text-base leading-none text-highlighted mt-1">Completo</span>
          </span>
        </NuxtLink>

        <UDashboardSidebarCollapse
          v-if="!collapsed"
          class="ml-auto"
        />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSidebarCollapse
          v-if="collapsed"
          class="mx-auto"
        />

        <UDashboardSearchButton
          :collapsed="collapsed"
          variant="outline"
        />

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
              <UAvatar
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

    <!-- title/description are passed explicitly: the installed @nuxt/ui locale
         has no `dashboardSearch.title` or `.description` key, so the defaults
         render as the literal translation keys in the dialog. -->
    <UDashboardSearch
      title="Search"
      description="Jump to a project or run a command"
      placeholder="Search projects and actions..."
      :groups="searchGroups"
    />

    <slot />
  </UDashboardGroup>
</template>
