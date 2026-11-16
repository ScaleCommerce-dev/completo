<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-messages'

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
    const result = await $fetch<{ revokedAgentTokens?: number }>('/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value }
    })
    const { fetch: refreshSession } = useUserSession()
    await refreshSession()
    if (result.revokedAgentTokens) {
      useToast().add({
        title: 'Your agents need new tokens',
        description: `${plural(result.revokedAgentTokens, 'agent token')} revoked with the reset, in case someone else held your account. Generate new ones on the Agents page.`,
        color: 'info',
        actions: [{ label: 'Agents', to: '/agents' }]
      })
    }
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
    <div class="pt-7 pb-2">
      <h2 class="auth-title">
        Set a new password
      </h2>
      <p class="text-base text-muted">
        Choose a new password for your account
      </p>
    </div>

    <form
      class="pb-7 flex flex-col gap-5"
      @submit.prevent="resetPassword"
    >
      <UFormField
        label="New password"
      >
        <UInput
          v-model="password"
          type="password"
          :placeholder="`At least ${PASSWORD_MIN_LENGTH} characters`"
          icon="i-lucide-lock"
          required
          size="lg"
          class="w-full"
        />
      </UFormField>

      <AuthErrorBanner :message="error" />

      <div>
        <UButton
          type="submit"
          label="Reset password and sign in"
          block
          :loading="loading"
          size="lg"
          :disabled="!token"
        />
      </div>
    </form>

    <AuthFooter
      prompt="Link expired?"
      to="/auth/forgot-password"
      label="Request a new one"
    />
  </div>
</template>
