<script setup lang="ts">
definePageMeta({ layout: 'default' })

const { public: { appVersion } } = useRuntimeConfig()

const { data: profileData } = useFetch<{
  createdAt: string | null
  lastSeenAt: string | null
  priorityCounts: Record<string, number>
  totalOpen: number
  projects: Array<{
    id: string
    name: string
    slug: string
    key: string
    icon: string | null
    role: string
    openCards: number
  }>
}>('/api/user/profile')
</script>

<template>
  <div class="px-8 pt-8 max-w-[640px]">
    <!-- Header -->
    <div class="flex items-center justify-end mb-4">
      <NotificationBell />
    </div>

    <ProfileSettings :profile-data="profileData" />
    <ProfileActivity
      v-if="profileData"
      :profile-data="profileData"
    />
    <ProfileSecurity />
    <ProfileTokens />
    <ProfileDangerZone />

    <div
      v-if="appVersion"
      class="mt-6 mb-8 text-center text-[11px] text-zinc-400 dark:text-zinc-500"
    >
      Completo v{{ appVersion }}
    </div>
  </div>
</template>
