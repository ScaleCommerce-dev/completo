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
    class="mt-6 mb-8 rounded-xl border border-red-200/60 dark:border-red-800/40 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden"
  >
    <div class="px-5 pt-4 pb-2">
      <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-500 dark:text-red-400">Danger Zone</span>
    </div>

    <div class="px-5 pb-4">
      <p class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Permanently delete your account and all associated data. This removes your project memberships and unassigns you from any cards. This action cannot be undone.
      </p>

      <div
        v-if="!showDeleteAccount"
        class="mt-3"
      >
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
          @click="showDeleteAccount = true; deleteEmail = ''; deletePassword = ''; deleteError = ''"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="text-[14px]"
          />
          Delete Account
        </button>
      </div>

      <!-- Inline confirmation panel -->
      <div
        v-else
        class="mt-3 rounded-lg border border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-3"
      >
        <p class="text-[13px] font-medium text-red-600 dark:text-red-400">
          Type your email <span class="font-bold">{{ user?.email }}</span> and enter your password to confirm.
        </p>

        <div class="space-y-2">
          <input
            v-model="deleteEmail"
            type="email"
            placeholder="Your email address"
            class="w-full text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
          >
          <input
            v-model="deletePassword"
            type="password"
            placeholder="Your password"
            autocomplete="current-password"
            class="w-full text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
          >
        </div>

        <!-- Delete error -->
        <div
          v-if="deleteError"
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
        >
          <UIcon
            name="i-lucide-alert-circle"
            class="text-[14px] text-red-500 shrink-0"
          />
          <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ deleteError }}</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!deleteEmailValid || !deletePassword || deleteLoading"
            @click="deleteAccount"
          >
            <UIcon
              v-if="!deleteLoading"
              name="i-lucide-trash-2"
              class="text-[13px]"
            />
            <UIcon
              v-else
              name="i-lucide-loader-2"
              class="text-[13px] animate-spin"
            />
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
</template>
