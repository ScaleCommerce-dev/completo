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
    class="mt-6 rounded-xl border border-default bg-default shadow-raise overflow-hidden"
    @submit.prevent="changePassword"
    @keydown="handlePasswordKeydown"
  >
    <div class="px-5 pt-4 pb-2">
      <span class="text-xs font-semibold uppercase tracking-label text-dimmed">Security</span>
    </div>

    <div class="mx-5 mt-2 rounded-lg border border-default divide-y divide-default overflow-hidden">
      <!-- Current password -->
      <div class="flex items-center px-3 py-2.5 bg-default">
        <label
          for="password-current"
          class="flex items-center gap-2 w-28 shrink-0 cursor-pointer"
        >
          <UIcon
            name="i-lucide-lock"
            class="text-sm text-dimmed"
          />
          <span class="text-sm font-medium text-muted">Current</span>
        </label>
        <input
          id="password-current"
          v-model="currentPassword"
          type="password"
          placeholder="Current password"
          autocomplete="current-password"
          class="flex-1 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0"
        >
      </div>

      <!-- New password -->
      <div class="flex items-center px-3 py-2.5 bg-default">
        <label
          for="password-new"
          class="flex items-center gap-2 w-28 shrink-0 cursor-pointer"
        >
          <UIcon
            name="i-lucide-key-round"
            class="text-sm text-dimmed"
          />
          <span class="text-sm font-medium text-muted">New</span>
        </label>
        <input
          id="password-new"
          v-model="newPassword"
          type="password"
          placeholder="New password (min 6 chars)"
          autocomplete="new-password"
          class="flex-1 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0"
        >
      </div>

      <!-- Confirm password -->
      <div class="flex items-center px-3 py-2.5 bg-default">
        <label
          for="password-confirm"
          class="flex items-center gap-2 w-28 shrink-0 cursor-pointer"
        >
          <UIcon
            name="i-lucide-check-circle"
            class="text-sm text-dimmed"
          />
          <span class="text-sm font-medium text-muted">Confirm</span>
        </label>
        <input
          id="password-confirm"
          v-model="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          autocomplete="new-password"
          class="flex-1 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0"
        >
      </div>
    </div>

    <!-- Password error -->
    <UAlert
      v-if="passwordError"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-circle"
      :description="passwordError"
      class="mx-5 mt-3"
    />

    <!-- Password success -->
    <div
      v-if="passwordSuccess"
      class="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/30"
    >
      <UIcon
        name="i-lucide-check-circle"
        class="text-base text-success shrink-0"
      />
      <span class="text-sm font-medium text-success">Password changed</span>
    </div>

    <!-- Password actions -->
    <div class="flex items-center justify-between px-5 pt-4 pb-5 mt-3 border-t border-muted">
      <div class="flex items-center gap-1.5">
        <span
          v-if="newPassword && newPassword.length < 6"
          class="text-xs font-medium text-warning"
        >
          Min 6 characters
        </span>
        <span
          v-else-if="newPassword && confirmPassword && newPassword !== confirmPassword"
          class="text-xs font-medium text-warning"
        >
          Passwords don't match
        </span>
        <span
          v-else-if="newPassword && confirmPassword && newPassword === confirmPassword && newPassword.length >= 6"
          class="flex items-center gap-1 text-xs font-medium text-success"
        >
          <UIcon
            name="i-lucide-check"
            class="text-xs"
          />
          Ready
        </span>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          type="submit"
          label="Change password"
          icon="i-lucide-lock"
          :loading="passwordLoading"
          :disabled="!currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6"
        >
          <template #trailing>
            <UiKey value="meta" />
            <UiKey value="enter" />
          </template>
        </UButton>
      </div>
    </div>

    <!-- Sign out section -->
    <div class="mx-5 mb-5 border-t border-muted pt-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-medium text-toned">Session</span>
          <p class="text-xs text-dimmed mt-0.5">
            Sign out of your account on this device
          </p>
        </div>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-muted hover:text-default hover:bg-elevated transition-colors disabled:opacity-40"
          :disabled="signingOut"
          @click="signOut"
        >
          <UIcon
            v-if="!signingOut"
            name="i-lucide-log-out"
            class="text-base"
          />
          <UIcon
            v-else
            name="i-lucide-loader-2"
            class="text-base animate-spin"
          />
          Sign Out
        </button>
      </div>
    </div>
  </form>
</template>
