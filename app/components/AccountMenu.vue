<script setup lang="ts">
/**
 * The account menu at the right end of the topbar (handoff
 * `03-layout-navigation.md` › Topbar). It lived in the sidebar's footer; the
 * guideline puts every global action — theme, account — in the topbar and
 * leaves the sidebar's foot to the collapse switch.
 */
const { user } = useUserSession()
const signOut = useSignOut()

const items = computed(() => [
  [{
    label: user.value?.name || 'Account',
    type: 'label' as const
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
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: signOut
  }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      variant="ghost"
      color="neutral"
      :aria-label="`Account: ${user?.name || 'Account'}`"
      :label="user?.name || undefined"
      class="group"
      :ui="{
        label: 'max-lg:hidden truncate max-w-40',
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
          size="xs"
        />
      </template>
    </UButton>
  </UDropdownMenu>
</template>
