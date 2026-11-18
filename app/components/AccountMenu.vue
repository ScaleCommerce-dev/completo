<script setup lang="ts">
/**
 * The account menu at the right end of the topbar (handoff
 * `03-layout-navigation.md` › Topbar). It lived in the sidebar's footer; the
 * guideline puts every global action — theme, account — in the topbar and
 * leaves the sidebar's foot to the collapse switch. It also carries the theme
 * choice and the running version.
 */
const { user } = useUserSession()
const signOut = useSignOut()
const colorMode = useColorMode()
// Saved to the account too, or the stored mode wins on the next load.
const { setTheme } = useThemePreference()
const { public: { appVersion } } = useRuntimeConfig()

/**
 * The theme lives here, not in the topbar (handoff `03` › Topbar): it is set
 * once and rarely touched, so it does not earn a permanent place in the header,
 * and a menu can offer "Auto", which a two-state switch could not.
 *
 * One segmented row in a group of its own, not a label and three checkbox
 * rows: that took four rows for a setting most people touch once. Each segment
 * names its mode in words as well as an icon, because no icon says "follow
 * the system" until you hover it, and in a menu opened once nobody has learned
 * it yet; with the words, the row needs no heading. "Auto", not
 * "System": shorter, and it says what the mode does rather than where it looks.
 * The selected segment keeps the others' weight, because a bolder label is a
 * wider one, and the menu sizes to its content: it changed width on every
 * click. A click on a segment sets that mode; selecting the row itself (Enter)
 * steps to the next, which is the keyboard path, because a menu item's roving
 * focus never reaches buttons inside it. Either way the menu stays open, so
 * the change is seen to land.
 */
const THEMES = [
  { value: 'system', label: 'Auto', icon: 'i-lucide-monitor' },
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' }
] as const
type ThemeMode = typeof THEMES[number]['value']

const currentTheme = computed(() =>
  THEMES.find(t => t.value === colorMode.preference) ?? THEMES[0])

function pickTheme(mode: ThemeMode) {
  if (colorMode.preference !== mode) setTheme(mode)
}

function cycleTheme(e: Event) {
  e.preventDefault()
  const i = THEMES.findIndex(t => t.value === currentTheme.value.value)
  pickTheme(THEMES[(i + 1) % THEMES.length]!.value)
}

const items = computed(() => [
  // Avatar, name and email (handoff `03` › Kontomenü › Kopf). The button shows
  // only the avatar, so the same picture here ties the menu to it, and the
  // address says which account you are signed in with. The avatar sits on the
  // entries' left edge; at 32px it is wider than their 20px icon column, so the
  // text beside it is its caption rather than on their text column.
  [{
    label: user.value?.name || 'Account',
    description: user.value?.email,
    type: 'label' as const,
    slot: 'account' as const,
    ui: { label: 'py-2.5 gap-3', itemDescription: 'font-normal' }
  }],
  [{
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/profile'
  }, {
    // The guideline's account menu carries at least profile, sign-in and
    // security, and sign out (handoff `03` › Topbar).
    label: 'Sign-in & security',
    icon: 'i-lucide-lock',
    to: '/profile#security'
  }, {
    label: 'API docs',
    icon: 'i-lucide-book-open',
    onSelect: () => window.open('/api/docs', '_blank')
  }],
  [{
    label: 'Theme',
    slot: 'theme' as const,
    // No inline padding: each segment carries the item's own 10px, so the
    // first segment's icon and label land on the icon and text columns of the
    // entries above and below. The segments are taller than a text line, so
    // the row gives back vertical padding to keep its neighbours' height.
    class: 'px-0 py-1.5',
    onSelect: cycleTheme
  }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: signOut
  }],
  // The running version, last (handoff `03` › Topbar), as a footer behind its
  // own divider: directly under Sign out it read as that entry's caption.
  // Absent in a build without `npm_package_version`.
  ...(appVersion
    ? [[{ label: `Completo v${appVersion}`, type: 'label' as const, class: 'py-2 text-xs font-normal text-muted' }]]
    : [])
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'min-w-64' }"
  >
    <template #account-leading>
      <UiAvatar
        :src="user?.avatarUrl || undefined"
        :alt="user?.name || 'Account'"
        size="md"
      />
    </template>
    <template #theme>
      <span
        class="flex w-full items-center gap-1"
        aria-hidden="true"
      >
        <button
          v-for="t in THEMES"
          :key="t.value"
          type="button"
          tabindex="-1"
          :aria-label="t.value === 'system' ? 'Auto theme, follows the system' : `${t.label} theme`"
          class="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors"
          :class="t.value === currentTheme.value
            ? 'bg-accented text-highlighted'
            : 'text-muted hover:text-default'"
          @click.stop.prevent="pickTheme(t.value)"
        >
          <UIcon
            :name="t.icon"
            class="size-5 shrink-0"
          />
          {{ t.label }}
        </button>
      </span>
      <span class="sr-only">Theme: {{ currentTheme.label }}</span>
    </template>
    <UButton
      variant="ghost"
      color="neutral"
      :aria-label="`Account: ${user?.name || 'Account'}`"
      class="group min-h-9 py-1"
      :ui="{
        // Avatar and chevron, no name (handoff `03` › Topbar › Konto): the name
        // is in the menu's heading, and the topbar needs the width for search.
        // The dropdown chevron turns over while the menu is open (handoff
        // `06-motion.md` › Dropdown-Chevron: 180°, 200ms); reduced motion
        // drops the turn with every other transition.
        trailingIcon: 'transition-transform duration-200 group-data-[state=open]:rotate-180'
      }"
      trailing-icon="i-lucide-chevron-down"
    >
      <template #leading>
        <UiAvatar
          :src="user?.avatarUrl || undefined"
          :alt="user?.name || 'Account'"
          size="sm"
        />
      </template>
    </UButton>
  </UDropdownMenu>
</template>
