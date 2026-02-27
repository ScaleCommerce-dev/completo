<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const token = computed(() => route.query.token as string || '')

const password = ref('')
const loading = ref(false)
const error = ref('')

async function resetPassword() {
  if (!token.value) {
    error.value = 'Invalid reset link'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await $fetch('/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value }
    })
    const { fetch: refreshSession } = useUserSession()
    await refreshSession()
    navigateTo('/projects')
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to reset password')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-glass">
    <div class="px-7 pt-7 pb-2">
      <h2 class="text-base font-bold text-center tracking-[-0.02em]">
        Set a new password
      </h2>
      <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400 mt-1">
        Choose a new password for your account
      </p>
    </div>

    <form
      class="px-7 pb-7 flex flex-col gap-5"
      @submit.prevent="resetPassword"
    >
      <UFormField
        label="New Password"
        class="auth-field"
        style="animation-delay: 0.05s"
      >
        <UInput
          v-model="password"
          type="password"
          placeholder="At least 8 characters"
          icon="i-lucide-lock"
          required
          size="lg"
          class="w-full"
        />
      </UFormField>

      <AuthErrorBanner :error="error" />

      <div
        class="auth-field"
        style="animation-delay: 0.1s"
      >
        <UButton
          type="submit"
          label="Reset Password & Sign In"
          block
          :loading="loading"
          size="lg"
          :disabled="!token"
        />
      </div>
    </form>

    <div class="px-7 pb-6 pt-1">
      <div class="border-t border-zinc-200/40 dark:border-zinc-700/25 pt-4">
        <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400">
          Link expired?
          <NuxtLink
            to="/auth/forgot-password"
            class="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >Request a new one</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
