<script setup lang="ts">
const { user, clear: clearSession } = useUserSession()

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
  <div
    v-if="!user?.isAdmin"
    class="mt-6 mb-8 rounded-xl border border-error/30 bg-default shadow-sm overflow-hidden"
  >
    <div class="px-5 pt-4 pb-2">
      <span class="text-xs font-semibold uppercase tracking-[0.08em] text-error">Danger Zone</span>
    </div>

    <div class="px-5 pb-4">
      <p class="text-sm text-muted leading-relaxed">
        Permanently delete your account and all associated data. This removes your project memberships and unassigns you from any cards. This action cannot be undone.
      </p>

      <div
        v-if="!showDeleteAccount"
        class="mt-3"
      >
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-error hover:text-error hover:bg-error/10 transition-colors"
          @click="showDeleteAccount = true; deleteEmail = ''; deletePassword = ''; deleteError = ''"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="text-base"
          />
          Delete Account
        </button>
      </div>

      <!-- Inline confirmation panel -->
      <div
        v-else
        class="mt-3 rounded-lg border border-error/30 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-3"
      >
        <p class="text-sm font-medium text-error">
          Type your email <span class="font-bold">{{ user?.email }}</span> and enter your password to confirm.
        </p>

        <div class="space-y-2">
          <input
            v-model="deleteEmail"
            type="email"
            placeholder="Your email address"
            class="w-full text-base text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-default border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
          >
          <input
            v-model="deletePassword"
            type="password"
            placeholder="Your password"
            autocomplete="current-password"
            class="w-full text-base text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-default border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
          >
        </div>

        <!-- Delete error -->
        <UAlert
          v-if="deleteError"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="deleteError"
        />

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!deleteEmailValid || !deletePassword || deleteLoading"
            @click="deleteAccount"
          >
            <UIcon
              v-if="!deleteLoading"
              name="i-lucide-trash-2"
              class="text-sm"
            />
            <UIcon
              v-else
              name="i-lucide-loader-2"
              class="text-sm animate-spin"
            />
            Delete My Account
          </button>
          <button
            type="button"
            class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
            @click="showDeleteAccount = false; deleteEmail = ''; deletePassword = ''; deleteError = ''"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
