<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Profile · Completo' })

const { public: { appVersion } } = useRuntimeConfig()

const { data: profileData } = useFetch<{
  createdAt: string | null
  lastSeenAt: string | null
  emailNotifications: boolean
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

const SECTIONS = [
  { id: 'account', label: 'Account', icon: 'i-lucide-user' },
  { id: 'activity', label: 'Activity', icon: 'i-lucide-activity' },
  { id: 'security', label: 'Sign-in & security', icon: 'i-lucide-lock' },
  { id: 'tokens', label: 'API tokens', icon: 'i-lucide-key-round' },
  { id: 'connections', label: 'Connected apps', icon: 'i-lucide-link' },
  { id: 'danger', label: 'Delete account', icon: 'i-lucide-triangle-alert' }
]
</script>

<template>
  <UiPage
    title="Profile"
    description="Your account, security and API tokens"
    width="wide"
  >
    <!--
      An account page: one scroller, with the section navigation beside the
      sections (handoff `03-layout-navigation.md` › Seitentypen › Konto). The
      cards keep the guideline's 720px measure.
    -->
    <div class="c2s-toc-layout">
      <UiToc :items="SECTIONS" />
      <div class="min-w-0 max-w-settings">
        <section
          id="account"
          class="scroll-mt-6"
        >
          <ProfileSettings :profile-data="profileData" />
        </section>
        <section
          id="activity"
          class="scroll-mt-6"
        >
          <ProfileActivity
            v-if="profileData"
            :profile-data="profileData"
          />
        </section>
        <section
          id="security"
          class="scroll-mt-6"
        >
          <ProfileSecurity />
        </section>
        <section
          id="tokens"
          class="scroll-mt-6"
        >
          <ProfileTokens />
        </section>
        <section
          id="connections"
          class="scroll-mt-6"
        >
          <ProfileConnections />
        </section>
        <section
          id="danger"
          class="scroll-mt-6"
        >
          <ProfileDangerZone />
        </section>

        <div
          v-if="appVersion"
          class="mt-6 mb-8 text-center text-xs text-dimmed"
        >
          Completo v{{ appVersion }}
        </div>
      </div>
    </div>
  </UiPage>
</template>
