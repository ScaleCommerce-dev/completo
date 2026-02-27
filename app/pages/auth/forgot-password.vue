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
  <!-- Success state -->
  <div
    v-if="submitted"
    class="auth-glass"
  >
    <div class="px-7 py-7 flex flex-col items-center gap-4 text-center">
      <div class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <UIcon
          name="i-lucide-mail-check"
          class="text-emerald-600 dark:text-emerald-400 text-xl"
        />
      </div>
      <h2 class="text-base font-bold tracking-[-0.02em]">
        Check your email
      </h2>
      <p class="text-[13px] text-zinc-500 dark:text-zinc-400">
        If an account exists for <span class="font-semibold text-zinc-700 dark:text-zinc-300">{{ email }}</span>,
        we've sent a password reset link.
      </p>
      <div class="border-t border-zinc-200/40 dark:border-zinc-700/25 pt-4 mt-2 w-full">
        <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400">
          Remember your password?
          <NuxtLink
            to="/login"
            class="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >Sign in</NuxtLink>
        </p>
      </div>
    </div>
  </div>

  <!-- Request form -->
  <div
    v-else
    class="auth-glass"
  >
    <div class="px-7 pt-7 pb-2">
      <h2 class="text-base font-bold text-center tracking-[-0.02em]">
        Reset your password
      </h2>
      <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400 mt-1">
        Enter your email and we'll send you a reset link
      </p>
    </div>

    <form
      class="px-7 pb-7 flex flex-col gap-5"
      @submit.prevent="requestReset"
    >
      <UFormField
        label="Email"
        class="auth-field"
        style="animation-delay: 0.05s"
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

      <AuthErrorBanner :error="error" />

      <div
        class="auth-field"
        style="animation-delay: 0.1s"
      >
        <UButton
          type="submit"
          label="Send Reset Link"
          block
          :loading="loading"
          size="lg"
        />
      </div>
    </form>

    <div class="px-7 pb-6 pt-1">
      <div class="border-t border-zinc-200/40 dark:border-zinc-700/25 pt-4">
        <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400">
          Remember your password?
          <NuxtLink
            to="/login"
            class="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >Sign in</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
