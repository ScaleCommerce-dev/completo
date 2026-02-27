<script setup lang="ts">
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

const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    await $fetch('/auth/logout', { method: 'POST' })
    await useUserSession().clear()
    navigateTo('/login')
  } catch {
    signingOut.value = false
  }
}
</script>

<template>
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
          <UIcon
            name="i-lucide-lock"
            class="text-sm text-zinc-400"
          />
          <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Current</span>
        </div>
        <input
          v-model="currentPassword"
          type="password"
          placeholder="Current password"
          autocomplete="current-password"
          class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
        >
      </div>

      <!-- New password -->
      <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-key-round"
            class="text-sm text-zinc-400"
          />
          <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">New</span>
        </div>
        <input
          v-model="newPassword"
          type="password"
          placeholder="New password (min 6 chars)"
          autocomplete="new-password"
          class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
        >
      </div>

      <!-- Confirm password -->
      <div class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50">
        <div class="flex items-center gap-2 w-28 shrink-0">
          <UIcon
            name="i-lucide-check-circle"
            class="text-sm text-zinc-400"
          />
          <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Confirm</span>
        </div>
        <input
          v-model="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          autocomplete="new-password"
          class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
        >
      </div>
    </div>

    <!-- Password error -->
    <div
      v-if="passwordError"
      class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
    >
      <UIcon
        name="i-lucide-alert-circle"
        class="text-[14px] text-red-500 shrink-0"
      />
      <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ passwordError }}</span>
    </div>

    <!-- Password success -->
    <div
      v-if="passwordSuccess"
      class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40"
    >
      <UIcon
        name="i-lucide-check-circle"
        class="text-[14px] text-emerald-500 shrink-0"
      />
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
          <UIcon
            name="i-lucide-check"
            class="text-[12px]"
          />
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
          <UIcon
            v-if="!passwordLoading"
            name="i-lucide-lock"
            class="text-[14px]"
          />
          <UIcon
            v-else
            name="i-lucide-loader-2"
            class="text-[14px] animate-spin"
          />
          Change Password
        </button>
      </div>
    </div>

    <!-- Sign out section -->
    <div class="mx-5 mb-5 border-t border-zinc-100 dark:border-zinc-700/40 pt-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">Session</span>
          <p class="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            Sign out of your account on this device
          </p>
        </div>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all disabled:opacity-40"
          :disabled="signingOut"
          @click="signOut"
        >
          <UIcon
            v-if="!signingOut"
            name="i-lucide-log-out"
            class="text-[14px]"
          />
          <UIcon
            v-else
            name="i-lucide-loader-2"
            class="text-[14px] animate-spin"
          />
          Sign Out
        </button>
      </div>
    </div>
  </form>
</template>
