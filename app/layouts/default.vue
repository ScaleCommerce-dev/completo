<script setup lang="ts">
const { user, clear } = useUserSession()
const { navItems } = useNavigation()
const router = useRouter()

async function logout() {
  await $fetch('/auth/logout', { method: 'POST' })
  await clear()
  await router.push('/login')
}

const userMenuItems = computed(() => [
  [{
    label: 'Profile',
    icon: 'i-lucide-user',
    onSelect: () => router.push('/profile')
  }, {
    label: 'API Docs',
    icon: 'i-lucide-book-open',
    onSelect: () => window.open('/api/docs', '_blank')
  }, {
    label: 'Logout',
    icon: 'i-lucide-log-out',
    onSelect: logout
  }]
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar class="!min-h-0 !h-full">
      <template #header>
        <div class="flex items-center gap-3 px-1">
          <div class="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25">
            <img
              src="/completo-icon.svg"
              alt="Completo"
              class="w-[22px] h-[22px] invert"
            >
          </div>
          <div class="flex flex-col">
            <span class="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 tracking-widest uppercase leading-none">Drag. Drop.</span>
            <span class="sidebar-brand font-extrabold text-[15px] leading-none text-zinc-900 dark:text-zinc-100 mt-0.5">Completo</span>
          </div>
        </div>
      </template>

      <template #default>
        <UNavigationMenu
          :items="navItems"
          orientation="vertical"
        />
      </template>

      <template #footer>
        <div class="flex items-center gap-1 flex-1 min-w-0">
          <div class="min-w-0 flex-1">
            <UDropdownMenu :items="userMenuItems">
              <button class="flex items-center gap-2 min-w-0 w-full rounded-md px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                <UAvatar
                  :alt="user?.name || 'User'"
                  size="2xs"
                  class="ring-2 ring-zinc-200 dark:ring-zinc-700 flex-shrink-0"
                />
                <span class="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{{ user?.name || 'User' }}</span>
              </button>
            </UDropdownMenu>
          </div>
          <UColorModeButton
            variant="ghost"
            color="neutral"
            size="xs"
            class="flex-shrink-0"
          />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel class="!min-h-0 !h-full !overflow-y-auto">
      <slot />
    </UDashboardPanel>
  </UDashboardGroup>
</template>
