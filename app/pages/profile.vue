<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface PriorityCounts {
  urgent: number
  high: number
  medium: number
  low: number
}

interface ProfileProject {
  id: string
  name: string
  slug: string
  key: string
  icon: string | null
  role: string
  openCards: number
}

const { user, clear: clearSession } = useUserSession()

// Profile timestamps
const { data: profileData } = useFetch<{
  createdAt: string | null
  lastSeenAt: string | null
  priorityCounts: Record<string, number>
  totalOpen: number
  projects: ProfileProject[]
}>('/api/user/profile')

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function accentFor(project: ProfileProject): string {
  return ACCENT_COLORS[hashCode(project.id || project.name) % ACCENT_COLORS.length]!
}

// Composables
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

const {
  currentPassword,
  newPassword,
  confirmPassword,
  passwordLoading,
  passwordError,
  passwordSuccess,
  changePassword,
  handlePasswordKeydown
} = usePasswordChange()

const {
  tokens,
  tokenName,
  tokenExpiry,
  tokenLoading,
  createdToken,
  createdTokenName,
  tokenCopied,
  deletingTokenId,
  createToken,
  copyToken,
  startDeleteToken,
  cancelDeleteToken,
  confirmDeleteToken,
  formatTokenDate
} = useApiTokens()

// Sign out
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    await $fetch('/auth/logout', { method: 'POST' })
    await clearSession()
    navigateTo('/login')
  } catch {
    signingOut.value = false
  }
}

// Danger zone: account deletion
const showDeleteAccount = ref(false)
const deleteEmail = ref('')
const deletePassword = ref('')
const deleteLoading = ref(false)
const deleteError = ref('')

const deleteEmailValid = computed(() =>
  deleteEmail.value.trim().toLowerCase() === (user.value?.email || '').toLowerCase()
)

async function deleteAccount() {
  if (!deleteEmailValid.value || !deletePassword.value) return
  deleteLoading.value = true
  deleteError.value = ''
  try {
    await $fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: deletePassword.value }
    })
    await clearSession()
    navigateTo('/login')
  } catch (e: unknown) {
    deleteError.value = getErrorMessage(e, 'Failed to delete account')
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <div class="px-8 pt-8 max-w-[640px]">

    <!-- Header -->
    <div class="flex items-center justify-end mb-4">
      <NotificationBell />
    </div>

    <!-- Profile form -->
    <form @submit.prevent="saveProfile" @keydown="handleProfileKeydown">

      <!-- Profile card with integrated identity header -->
      <div class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden">

        <!-- Identity header: Avatar + Name + Email -->
        <div class="flex items-center gap-4 px-5 pt-5 pb-4">
          <!-- Avatar -->
          <div class="relative shrink-0">
            <img
              v-if="hasGravatar && !gravatarOverride"
              :src="gravatarUrl"
              alt="Profile photo"
              class="w-16 h-16 rounded-full ring-[3px] ring-white dark:ring-zinc-800 shadow-md shadow-zinc-900/8 dark:shadow-black/20 object-cover"
            />
            <div
              v-else
              class="w-16 h-16 rounded-full ring-[3px] ring-white dark:ring-zinc-800 shadow-md shadow-zinc-900/8 dark:shadow-black/20 bg-gradient-to-br from-indigo-400 via-violet-400 to-purple-500 flex items-center justify-center"
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
              class="w-full text-[18px] font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 border-b-2 border-transparent hover:border-zinc-200/60 dark:hover:border-zinc-700/40 focus:border-indigo-500/40 dark:focus:border-indigo-400/30 rounded-none outline-none! ring-0! tracking-[-0.02em] leading-tight py-0.5 transition-colors"
            />
            <div class="flex items-center gap-1.5 mt-1">
              <UIcon name="i-lucide-mail" class="text-[11px] text-zinc-300 dark:text-zinc-600" />
              <span class="text-[13px] text-zinc-400 dark:text-zinc-500 truncate">{{ user?.email }}</span>
            </div>
            <div v-if="profileData" class="flex items-center gap-3 mt-1.5">
              <div v-if="profileData.createdAt" class="flex items-center gap-1">
                <UIcon name="i-lucide-calendar" class="text-[10px] text-zinc-300 dark:text-zinc-600" />
                <span class="text-[11px] text-zinc-400 dark:text-zinc-500">Member since {{ formatDate(profileData.createdAt) }}</span>
              </div>
              <div v-if="profileData.lastSeenAt" class="flex items-center gap-1">
                <UIcon name="i-lucide-activity" class="text-[10px] text-zinc-300 dark:text-zinc-600" />
                <span class="text-[11px] text-zinc-400 dark:text-zinc-500">Active {{ relativeTime(profileData.lastSeenAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Divider -->
        <div class="mx-5 border-t border-zinc-100 dark:border-zinc-700/40" />

        <!-- Settings rows -->
        <div class="px-5 pt-3 pb-1">
          <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Preferences</span>
        </div>

        <div class="mx-5 mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700/50 divide-y divide-zinc-100 dark:divide-zinc-700/40 overflow-hidden">
          <!-- Avatar row: Gravatar detected (not overriding) -->
          <div v-if="hasGravatar && !gravatarOverride" class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
            <div class="flex items-center gap-2 w-28 shrink-0">
              <UIcon name="i-lucide-image" class="text-sm text-zinc-400" />
              <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Avatar</span>
            </div>
            <div class="flex flex-1 items-center justify-between">
              <span class="text-[13px] text-zinc-400 dark:text-zinc-500">via Gravatar</span>
              <button
                type="button"
                class="text-[12px] font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                @click="gravatarOverride = true"
              >
                Override
              </button>
            </div>
          </div>
          <!-- Avatar URL row: no Gravatar or overriding -->
          <div v-else-if="hasGravatar === false || gravatarOverride" class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
            <div class="flex items-center gap-2 w-28 shrink-0">
              <UIcon name="i-lucide-image" class="text-sm text-zinc-400" />
              <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Avatar URL</span>
            </div>
            <div class="flex flex-1 items-center gap-2">
              <input
                v-model="profileAvatarUrl"
                type="text"
                placeholder="https://..."
                class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
              />
              <button
                v-if="gravatarOverride"
                type="button"
                class="text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors shrink-0"
                @click="gravatarOverride = false; profileAvatarUrl = ''"
              >
                Use Gravatar
              </button>
            </div>
          </div>

          <!-- Theme row -->
          <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
            <div class="flex items-center gap-2 w-28 shrink-0">
              <UIcon name="i-lucide-sun-moon" class="text-sm text-zinc-400" />
              <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Theme</span>
            </div>
            <div class="flex gap-1">
              <button
                v-for="option in [{ value: 'system', label: 'System', icon: 'i-lucide-monitor' }, { value: 'light', label: 'Light', icon: 'i-lucide-sun' }, { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' }]"
                :key="option.value"
                type="button"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
                :class="profileColorMode === option.value ? 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'"
                @click="profileColorMode = option.value"
              >
                <UIcon :name="option.icon" class="text-[13px]" />
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Profile error -->
        <div v-if="profileError" class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
          <UIcon name="i-lucide-alert-circle" class="text-[14px] text-red-500 shrink-0" />
          <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ profileError }}</span>
        </div>

        <!-- Profile success -->
        <div v-if="profileSuccess" class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
          <UIcon name="i-lucide-check-circle" class="text-[14px] text-emerald-500 shrink-0" />
          <span class="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Profile updated</span>
        </div>

        <!-- Profile actions -->
        <div class="flex items-center justify-end px-5 pt-4 pb-5 mt-3 border-t border-zinc-100 dark:border-zinc-700/40">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono text-zinc-300 dark:text-zinc-600 hidden sm:block">
              <kbd class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500">&#8984;&#x23CE;</kbd>
            </span>
            <button
              type="submit"
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!profileName.trim() || profileLoading"
            >
              <UIcon v-if="!profileLoading" name="i-lucide-check" class="text-[14px]" />
              <UIcon v-else name="i-lucide-loader-2" class="text-[14px] animate-spin" />
              Save
            </button>
          </div>
        </div>
      </div>
    </form>

    <!-- Activity & Stats card -->
    <div v-if="profileData" class="mt-6 rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden">
      <div class="px-5 pt-4 pb-2">
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Activity</span>
      </div>

      <!-- Priority breakdown -->
      <div class="px-5 pt-2 pb-4">
        <div class="flex items-baseline gap-2 mb-3">
          <span class="text-[28px] font-extrabold tracking-[-0.03em] text-zinc-900 dark:text-zinc-100 leading-none">{{ profileData.totalOpen }}</span>
          <span class="text-[13px] font-medium text-zinc-400 dark:text-zinc-500">open {{ profileData.totalOpen === 1 ? 'card' : 'cards' }} assigned</span>
        </div>

        <!-- Stacked bar -->
        <div v-if="profileData.totalOpen > 0" class="h-2 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-700/50 mb-3">
          <div
            v-if="profileData.priorityCounts.urgent"
            class="h-full transition-all duration-500"
            :style="{ width: `${(profileData.priorityCounts.urgent / profileData.totalOpen) * 100}%`, backgroundColor: '#ef4444' }"
          />
          <div
            v-if="profileData.priorityCounts.high"
            class="h-full transition-all duration-500"
            :style="{ width: `${(profileData.priorityCounts.high / profileData.totalOpen) * 100}%`, backgroundColor: '#f97316' }"
          />
          <div
            v-if="profileData.priorityCounts.medium"
            class="h-full transition-all duration-500"
            :style="{ width: `${(profileData.priorityCounts.medium / profileData.totalOpen) * 100}%`, backgroundColor: '#6366f1' }"
          />
          <div
            v-if="profileData.priorityCounts.low"
            class="h-full transition-all duration-500"
            :style="{ width: `${(profileData.priorityCounts.low / profileData.totalOpen) * 100}%`, backgroundColor: '#94a3b8' }"
          />
        </div>

        <!-- Priority legend chips -->
        <div class="flex flex-wrap gap-2">
          <div
            v-for="p in [
              { key: 'urgent', label: 'Urgent', color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400' },
              { key: 'high', label: 'High', color: '#f97316', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400' },
              { key: 'medium', label: 'Medium', color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-600 dark:text-indigo-400' },
              { key: 'low', label: 'Low', color: '#94a3b8', bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-600 dark:text-slate-400' }
            ]"
            :key="p.key"
            class="flex items-center gap-1.5 px-2 py-1 rounded-md"
            :class="p.bg"
          >
            <UIcon :name="priorityIcon(p.key)" class="text-[15px] shrink-0" />
            <span class="text-[12px] font-semibold tabular-nums" :class="p.text">
              {{ (profileData.priorityCounts as unknown as PriorityCounts)[p.key as keyof PriorityCounts] || 0 }}
            </span>
            <span class="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{{ p.label }}</span>
          </div>
        </div>
      </div>

      <!-- Projects section -->
      <div v-if="profileData.projects?.length" class="border-t border-zinc-100 dark:border-zinc-700/40">
        <div class="px-5 pt-3 pb-1">
          <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Projects</span>
        </div>
        <div class="px-5 pb-4 pt-1 space-y-1">
          <NuxtLink
            v-for="project in profileData.projects"
            :key="project.id"
            :to="`/projects/${project.slug}`"
            class="group flex items-center gap-3 px-3 py-2.5 -mx-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
          >
            <div
              class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
            >
              <UIcon :name="`i-lucide-${project.icon || 'folder'}`" class="text-[15px]" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{{ project.name }}</span>
                <span
                  class="font-mono text-[8px] font-bold px-1 py-0.5 rounded tracking-wide shrink-0"
                  :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
                >{{ project.key }}</span>
              </div>
              <span class="text-[11px] text-zinc-400 dark:text-zinc-500">{{ project.openCards }} open {{ project.openCards === 1 ? 'card' : 'cards' }}</span>
            </div>
            <span
              class="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full shrink-0"
              :class="project.role === 'owner'
                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
            >{{ project.role }}</span>
            <UIcon name="i-lucide-chevron-right" class="text-[14px] text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500 transition-colors shrink-0" />
          </NuxtLink>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="profileData.totalOpen === 0 && !profileData.projects?.length" class="px-5 pb-4">
        <div class="flex items-center gap-2 text-[13px] text-zinc-400 dark:text-zinc-500">
          <UIcon name="i-lucide-inbox" class="text-[15px]" />
          <span>No project memberships yet</span>
        </div>
      </div>
    </div>

    <!-- Security card -->
    <form
      class="mt-6 rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden"
      @submit.prevent="changePassword"
      @keydown="handlePasswordKeydown"
    >
      <div class="px-5 pt-4 pb-2">
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Security</span>
      </div>

      <div class="mx-5 mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700/50 divide-y divide-zinc-100 dark:divide-zinc-700/40 overflow-hidden">
        <!-- Current password -->
        <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon name="i-lucide-lock" class="text-sm text-zinc-400" />
            <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Current</span>
          </div>
          <input
            v-model="currentPassword"
            type="password"
            placeholder="Current password"
            autocomplete="current-password"
            class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
          />
        </div>

        <!-- New password -->
        <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon name="i-lucide-key-round" class="text-sm text-zinc-400" />
            <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">New</span>
          </div>
          <input
            v-model="newPassword"
            type="password"
            placeholder="New password (min 6 chars)"
            autocomplete="new-password"
            class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
          />
        </div>

        <!-- Confirm password -->
        <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
          <div class="flex items-center gap-2 w-28 shrink-0">
            <UIcon name="i-lucide-check-circle" class="text-sm text-zinc-400" />
            <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Confirm</span>
          </div>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="Confirm new password"
            autocomplete="new-password"
            class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
          />
        </div>
      </div>

      <!-- Password error -->
      <div v-if="passwordError" class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
        <UIcon name="i-lucide-alert-circle" class="text-[14px] text-red-500 shrink-0" />
        <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ passwordError }}</span>
      </div>

      <!-- Password success -->
      <div v-if="passwordSuccess" class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
        <UIcon name="i-lucide-check-circle" class="text-[14px] text-emerald-500 shrink-0" />
        <span class="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Password changed</span>
      </div>

      <!-- Password actions -->
      <div class="flex items-center justify-between px-5 pt-4 pb-5 mt-3 border-t border-zinc-100 dark:border-zinc-700/40">
        <div class="flex items-center gap-1.5">
          <span
            v-if="newPassword && newPassword.length < 6"
            class="text-[12px] font-medium text-amber-500 dark:text-amber-400"
          >
            Min 6 characters
          </span>
          <span
            v-else-if="newPassword && confirmPassword && newPassword !== confirmPassword"
            class="text-[12px] font-medium text-amber-500 dark:text-amber-400"
          >
            Passwords don't match
          </span>
          <span
            v-else-if="newPassword && confirmPassword && newPassword === confirmPassword && newPassword.length >= 6"
            class="flex items-center gap-1 text-[12px] font-medium text-emerald-500 dark:text-emerald-400"
          >
            <UIcon name="i-lucide-check" class="text-[12px]" />
            Ready
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono text-zinc-300 dark:text-zinc-600 hidden sm:block">
            <kbd class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500">&#8984;&#x23CE;</kbd>
          </span>
          <button
            type="submit"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6 || passwordLoading"
          >
            <UIcon v-if="!passwordLoading" name="i-lucide-lock" class="text-[14px]" />
            <UIcon v-else name="i-lucide-loader-2" class="text-[14px] animate-spin" />
            Change Password
          </button>
        </div>
      </div>

      <!-- Sign out section -->
      <div class="mx-5 mb-5 border-t border-zinc-100 dark:border-zinc-700/40 pt-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">Session</span>
            <p class="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5">Sign out of your account on this device</p>
          </div>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all disabled:opacity-40"
            :disabled="signingOut"
            @click="signOut"
          >
            <UIcon v-if="!signingOut" name="i-lucide-log-out" class="text-[14px]" />
            <UIcon v-else name="i-lucide-loader-2" class="text-[14px] animate-spin" />
            Sign Out
          </button>
        </div>
      </div>
    </form>

    <!-- API Tokens card -->
    <div class="mt-6 rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden">
      <div class="px-5 pt-4 pb-2 flex items-center gap-2">
        <UIcon name="i-lucide-key-round" class="text-[14px] text-zinc-400" />
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">API Tokens</span>
      </div>

      <div class="px-5 pb-3">
        <p class="text-[13px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Create personal access tokens to authenticate with the API. Tokens have the same permissions as your account.
        </p>
      </div>

      <!-- Create token form -->
      <div class="mx-5 rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-zinc-800/50">
          <input
            v-model="tokenName"
            type="text"
            placeholder="Token name (e.g. CI Pipeline)"
            maxlength="100"
            class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
            @keydown.enter.prevent="createToken"
          />
          <select
            v-model="tokenExpiry"
            class="text-[13px] text-zinc-500 dark:text-zinc-400 bg-transparent border-0 outline-none! ring-0! cursor-pointer"
          >
            <option value="">No expiry</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            :disabled="!tokenName.trim() || tokenLoading"
            @click="createToken"
          >
            <UIcon v-if="!tokenLoading" name="i-lucide-plus" class="text-[14px]" />
            <UIcon v-else name="i-lucide-loader-2" class="text-[14px] animate-spin" />
            Create
          </button>
        </div>
      </div>

      <!-- Created token banner (one-time display) -->
      <div v-if="createdToken" class="mx-5 mt-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-check-circle" class="text-[14px] text-emerald-500 shrink-0" />
          <span class="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Token "{{ createdTokenName }}" created. Copy it now — it won't be shown again.</span>
        </div>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-[12px] font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 truncate select-all">{{ createdToken }}</code>
          <button
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all shrink-0"
            :class="tokenCopied ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'"
            @click="copyToken"
          >
            <UIcon :name="tokenCopied ? 'i-lucide-check' : 'i-lucide-copy'" class="text-[13px]" />
            {{ tokenCopied ? 'Copied!' : 'Copy' }}
          </button>
          <button
            type="button"
            class="text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            @click="createdToken = null"
          >
            Dismiss
          </button>
        </div>
      </div>

      <!-- Token list -->
      <div v-if="tokens.length > 0" class="mx-5 mt-3 mb-5 rounded-lg border border-zinc-200 dark:border-zinc-700/50 divide-y divide-zinc-100 dark:divide-zinc-700/40 overflow-hidden">
        <div
          v-for="token in tokens"
          :key="token.id"
          class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{{ token.name }}</span>
              <code class="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5 shrink-0">{{ token.tokenPrefix }}...</code>
              <span
                v-if="token.isExpired"
                class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 shrink-0"
              >Expired</span>
            </div>
            <div class="flex items-center gap-3 mt-0.5">
              <span class="text-[11px] text-zinc-400 dark:text-zinc-500">Created {{ formatTokenDate(token.createdAt) }}</span>
              <span v-if="token.expiresAt" class="text-[11px] text-zinc-400 dark:text-zinc-500">
                {{ token.isExpired ? 'Expired' : 'Expires' }} {{ formatTokenDate(token.expiresAt) }}
              </span>
              <span v-if="token.lastUsedAt" class="text-[11px] text-zinc-400 dark:text-zinc-500">Last used {{ relativeTime(token.lastUsedAt) }}</span>
            </div>
          </div>

          <!-- Delete button / confirmation -->
          <div class="shrink-0 ml-3">
            <UTooltip v-if="deletingTokenId !== token.id" text="Delete token">
              <button
                type="button"
                class="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60"
                style="opacity: 0.6"
                @click="startDeleteToken(token.id)"
              >
                <UIcon name="i-lucide-trash-2" class="text-[13px]" />
              </button>
            </UTooltip>
            <div v-else class="flex items-center gap-1.5">
              <button
                type="button"
                class="px-2 py-1 rounded-md text-[12px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                @click="confirmDeleteToken(token.id)"
              >
                Delete
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                @click="cancelDeleteToken"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="px-5 pb-5 pt-2">
        <div class="flex items-center gap-2 text-[13px] text-zinc-400 dark:text-zinc-500">
          <UIcon name="i-lucide-key-round" class="text-[14px]" />
          <span>No API tokens yet</span>
        </div>
      </div>
    </div>

    <!-- Danger Zone card (hidden for admins) -->
    <div
      v-if="!user?.isAdmin"
      class="mt-6 mb-8 rounded-xl border border-red-200/60 dark:border-red-800/40 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden"
    >
      <div class="px-5 pt-4 pb-2">
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-500 dark:text-red-400">Danger Zone</span>
      </div>

      <div class="px-5 pb-4">
        <p class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Permanently delete your account and all associated data. This removes your project memberships and unassigns you from any cards. This action cannot be undone.
        </p>

        <div v-if="!showDeleteAccount" class="mt-3">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            @click="showDeleteAccount = true; deleteEmail = ''; deletePassword = ''; deleteError = ''"
          >
            <UIcon name="i-lucide-trash-2" class="text-[14px]" />
            Delete Account
          </button>
        </div>

        <!-- Inline confirmation panel -->
        <div v-else class="mt-3 rounded-lg border border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-3">
          <p class="text-[13px] font-medium text-red-600 dark:text-red-400">
            Type your email <span class="font-bold">{{ user?.email }}</span> and enter your password to confirm.
          </p>

          <div class="space-y-2">
            <input
              v-model="deleteEmail"
              type="email"
              placeholder="Your email address"
              class="w-full text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
            />
            <input
              v-model="deletePassword"
              type="password"
              placeholder="Your password"
              autocomplete="current-password"
              class="w-full text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
            />
          </div>

          <!-- Delete error -->
          <div v-if="deleteError" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
            <UIcon name="i-lucide-alert-circle" class="text-[14px] text-red-500 shrink-0" />
            <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ deleteError }}</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!deleteEmailValid || !deletePassword || deleteLoading"
              @click="deleteAccount"
            >
              <UIcon v-if="!deleteLoading" name="i-lucide-trash-2" class="text-[13px]" />
              <UIcon v-else name="i-lucide-loader-2" class="text-[13px] animate-spin" />
              Delete My Account
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              @click="showDeleteAccount = false; deleteEmail = ''; deletePassword = ''; deleteError = ''"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
