<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const email = ref('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

async function requestReset() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value }
    })
    submitted.value = true
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Something went wrong. Please try again.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCheckEmail
    v-if="submitted"
    prompt="Remember your password?"
    to="/login"
    label="Sign in"
  >
    If an account exists for <span class="font-semibold text-default">{{ email }}</span>,
    we've sent a password reset link.
  </AuthCheckEmail>

  <div
    v-else
    class="auth-glass"
  >
    <!-- Request form -->
    <div class="pt-7 pb-2">
      <h2 class="auth-title">
        Reset your password
      </h2>
      <p class="text-base text-muted">
        Enter your email and we'll send you a reset link
      </p>
    </div>

    <form
      class="pb-7 flex flex-col gap-5"
      @submit.prevent="requestReset"
    >
      <UFormField
        label="Email"
      >
        <UInput
          v-model="email"
          type="email"
          placeholder="you@example.com"
          icon="i-lucide-mail"
          required
          size="lg"
          class="w-full"
        />
      </UFormField>

      <AuthErrorBanner :message="error" />

      <div>
        <UButton
          type="submit"
          label="Send reset link"
          block
          :loading="loading"
          size="lg"
        />
      </div>
    </form>

    <AuthFooter
      prompt="Remember your password?"
      to="/login"
      label="Sign in"
    />
  </div>
</template>
