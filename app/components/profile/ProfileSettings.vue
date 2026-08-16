<script setup lang="ts">
const { user } = useUserSession()

const {
  profileName,
  profileAvatarUrl,
  profileColorMode,
  profileLoading,
  profileError,
  profileSuccess,
  gravatarUrl,
  hasGravatar,
  gravatarOverride,
  saveProfile,
  handleProfileKeydown
} = useProfileForm()

defineProps<{
  profileData?: {
    createdAt: string | null
    lastSeenAt: string | null
  } | null
}>()

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <form
    @submit.prevent="saveProfile"
    @keydown="handleProfileKeydown"
  >
    <div class="rounded-xl border border-default bg-default shadow-raise overflow-hidden">
      <!-- Identity header: Avatar + Name + Email -->
      <div class="flex items-center gap-4 px-5 pt-5 pb-4">
        <!-- The initials fallback was a hand-rolled gradient circle; UAvatar
             already resolves src-or-initials, and the brand gradient belongs to
             the logo and the drag, not to every avatar. -->
        <UiAvatar
          :src="(hasGravatar && !gravatarOverride) ? gravatarUrl : undefined"
          :alt="profileName || 'You'"
          size="3xl"
          class="shrink-0 ring-[3px] ring-bg shadow-raise"
        />
        <!-- Name + Email -->
        <div class="flex-1 min-w-0">
          <input
            v-model="profileName"
            type="text"
            placeholder="Your name..."
            class="w-full text-lg font-bold text-highlighted placeholder:text-dimmed bg-transparent border-0 border-b-2 border-transparent hover:border-default focus:border-primary/40 rounded-none outline-none! ring-0! tracking-heading leading-tight py-0.5 transition-colors"
          >
          <div class="flex items-center gap-1.5 mt-1">
            <UIcon
              name="i-lucide-mail"
              class="text-xs text-dimmed"
            />
            <span class="text-sm text-dimmed truncate">{{ user?.email }}</span>
          </div>
          <div
            v-if="profileData"
            class="flex items-center gap-3 mt-1.5"
          >
            <div
              v-if="profileData.createdAt"
              class="flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-calendar"
                class="text-2xs text-dimmed"
              />
              <span class="text-xs text-dimmed">Member since {{ formatDate(profileData.createdAt) }}</span>
            </div>
            <div
              v-if="profileData.lastSeenAt"
              class="flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-activity"
                class="text-2xs text-dimmed"
              />
              <span class="text-xs text-dimmed">Active {{ relativeTime(profileData.lastSeenAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="mx-5 border-t border-muted" />

      <!-- Settings rows -->
      <div class="px-5 pt-3 pb-1">
        <span class="text-xs font-semibold uppercase tracking-label text-dimmed">Preferences</span>
      </div>

      <div class="mx-5 mt-2 rounded-lg border border-default divide-y divide-default overflow-hidden">
        <!-- Avatar row: Gravatar detected (not overriding) -->
        <div
          v-if="hasGravatar && !gravatarOverride"
          class="flex items-center px-3 py-2.5 bg-default"
        >
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon
              name="i-lucide-image"
              class="text-sm text-dimmed"
            />
            <span class="text-sm font-medium text-muted">Avatar</span>
          </div>
          <div class="flex flex-1 items-center justify-between">
            <span class="text-sm text-dimmed">via Gravatar</span>
            <button
              type="button"
              class="text-xs font-medium text-primary hover:text-primary transition-colors"
              @click="gravatarOverride = true"
            >
              Override
            </button>
          </div>
        </div>
        <!-- Avatar URL row: no Gravatar or overriding -->
        <div
          v-else-if="hasGravatar === false || gravatarOverride"
          class="flex items-center px-3 py-2.5 bg-default"
        >
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon
              name="i-lucide-image"
              class="text-sm text-dimmed"
            />
            <span class="text-sm font-medium text-muted">Avatar URL</span>
          </div>
          <div class="flex flex-1 items-center gap-2">
            <input
              v-model="profileAvatarUrl"
              type="text"
              placeholder="https://..."
              class="flex-1 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0 outline-none! ring-0!"
            >
            <button
              v-if="gravatarOverride"
              type="button"
              class="text-xs font-medium text-dimmed hover:text-toned transition-colors shrink-0"
              @click="gravatarOverride = false; profileAvatarUrl = ''"
            >
              Use Gravatar
            </button>
          </div>
        </div>

        <!-- Theme row -->
        <div class="flex items-center px-3 py-2.5 bg-default">
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon
              name="i-lucide-sun-moon"
              class="text-sm text-dimmed"
            />
            <span class="text-sm font-medium text-muted">Theme</span>
          </div>
          <div class="flex gap-1">
            <button
              v-for="option in [{ value: 'system', label: 'System', icon: 'i-lucide-monitor' }, { value: 'light', label: 'Light', icon: 'i-lucide-sun' }, { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' }]"
              :key="option.value"
              type="button"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              :class="profileColorMode === option.value ? 'bg-primary/10 text-primary' : 'text-dimmed hover:text-toned hover:bg-elevated'"
              @click="profileColorMode = option.value"
            >
              <UIcon
                :name="option.icon"
                class="text-sm"
              />
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Profile error -->
      <UAlert
        v-if="profileError"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :description="profileError"
        class="mx-5 mt-3"
      />

      <!-- Profile success -->
      <div
        v-if="profileSuccess"
        class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/30"
      >
        <UIcon
          name="i-lucide-check-circle"
          class="text-base text-success shrink-0"
        />
        <span class="text-sm font-medium text-success">Profile updated</span>
      </div>

      <!-- Profile actions -->
      <div class="flex items-center justify-end px-5 pt-4 pb-5 mt-3 border-t border-muted">
        <div class="flex items-center gap-2">
          <UButton
            type="submit"
            label="Save"
            icon="i-lucide-check"
            :loading="profileLoading"
            :disabled="!profileName.trim()"
          >
            <template #trailing>
              <UiKey value="meta" />
              <UiKey value="enter" />
            </template>
          </UButton>
        </div>
      </div>
    </div>
  </form>
</template>
