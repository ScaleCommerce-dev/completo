<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Profile · Completo' })

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
  <UiPage
    title="Profile"
    description="Your account, security and API tokens"
    width="narrow"
  >
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
      class="mt-6 mb-8 text-center text-xs text-dimmed"
    >
      Completo v{{ appVersion }}
    </div>
  </UiPage>
</template>
