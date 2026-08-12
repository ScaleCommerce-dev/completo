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
    <div class="rounded-xl border border-default bg-default shadow-sm overflow-hidden">
      <!-- Identity header: Avatar + Name + Email -->
      <div class="flex items-center gap-4 px-5 pt-5 pb-4">
        <!-- Avatar -->
        <div class="relative shrink-0">
          <img
            v-if="hasGravatar && !gravatarOverride"
            :src="gravatarUrl"
            alt="Profile photo"
            class="w-16 h-16 rounded-full ring-[3px] ring-[var(--ui-bg)] shadow-md shadow-zinc-900/8 dark:shadow-black/20 object-cover"
          >
          <div
            v-else
            class="w-16 h-16 rounded-full ring-[3px] ring-[var(--ui-bg)] shadow-md shadow-zinc-900/8 dark:shadow-black/20 bg-gradient-to-br from-indigo-400 via-violet-400 to-purple-500 flex items-center justify-center"
          >
            <span class="text-[24px] font-bold text-white/90 leading-none select-none">{{ profileName.charAt(0)?.toUpperCase() || '?' }}</span>
          </div>
        </div>
        <!-- Name + Email -->
        <div class="flex-1 min-w-0">
          <input
            v-model="profileName"
            type="text"
            placeholder="Your name..."
            class="w-full text-[18px] font-bold text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b-2 border-transparent hover:border-default hover:border-accented focus:border-primary/40 focus:border-primary/30 rounded-none outline-none! ring-0! tracking-[-0.02em] leading-tight py-0.5 transition-colors"
          >
          <div class="flex items-center gap-1.5 mt-1">
            <UIcon
              name="i-lucide-mail"
              class="text-[11px] text-dimmed"
            />
            <span class="text-[13px] text-dimmed truncate">{{ user?.email }}</span>
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
                class="text-[10px] text-dimmed"
              />
              <span class="text-[11px] text-dimmed">Member since {{ formatDate(profileData.createdAt) }}</span>
            </div>
            <div
              v-if="profileData.lastSeenAt"
              class="flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-activity"
                class="text-[10px] text-dimmed"
              />
              <span class="text-[11px] text-dimmed">Active {{ relativeTime(profileData.lastSeenAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="mx-5 border-t border-muted" />

      <!-- Settings rows -->
      <div class="px-5 pt-3 pb-1">
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-dimmed">Preferences</span>
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
            <span class="text-[13px] font-medium text-muted">Avatar</span>
          </div>
          <div class="flex flex-1 items-center justify-between">
            <span class="text-[13px] text-dimmed">via Gravatar</span>
            <button
              type="button"
              class="text-[12px] font-medium text-primary hover:text-primary transition-colors"
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
            <span class="text-[13px] font-medium text-muted">Avatar URL</span>
          </div>
          <div class="flex flex-1 items-center gap-2">
            <input
              v-model="profileAvatarUrl"
              type="text"
              placeholder="https://..."
              class="flex-1 text-[14px] text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
            >
            <button
              v-if="gravatarOverride"
              type="button"
              class="text-[12px] font-medium text-dimmed hover:text-toned hover:text-default transition-colors shrink-0"
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
            <span class="text-[13px] font-medium text-muted">Theme</span>
          </div>
          <div class="flex gap-1">
            <button
              v-for="option in [{ value: 'system', label: 'System', icon: 'i-lucide-monitor' }, { value: 'light', label: 'Light', icon: 'i-lucide-sun' }, { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' }]"
              :key="option.value"
              type="button"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
              :class="profileColorMode === option.value ? 'bg-primary/10 text-primary' : 'text-dimmed hover:text-toned hover:bg-elevated'"
              @click="profileColorMode = option.value"
            >
              <UIcon
                :name="option.icon"
                class="text-[13px]"
              />
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Profile error -->
      <div
        v-if="profileError"
        class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="text-[14px] text-red-500 shrink-0"
        />
        <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ profileError }}</span>
      </div>

      <!-- Profile success -->
      <div
        v-if="profileSuccess"
        class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40"
      >
        <UIcon
          name="i-lucide-check-circle"
          class="text-[14px] text-emerald-500 shrink-0"
        />
        <span class="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Profile updated</span>
      </div>

      <!-- Profile actions -->
      <div class="flex items-center justify-end px-5 pt-4 pb-5 mt-3 border-t border-muted">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono text-dimmed hidden sm:block">
            <kbd class="px-1 py-0.5 rounded bg-elevated border border-accented text-dimmed">&#8984;&#x23CE;</kbd>
          </span>
          <button
            type="submit"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!profileName.trim() || profileLoading"
          >
            <UIcon
              v-if="!profileLoading"
              name="i-lucide-check"
              class="text-[14px]"
            />
            <UIcon
              v-else
              name="i-lucide-loader-2"
              class="text-[14px] animate-spin"
            />
            Save
          </button>
        </div>
      </div>
    </div>
  </form>
</template>
