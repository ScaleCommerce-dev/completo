<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const isUnverified = ref(false)
const resendLoading = ref(false)
const resendSuccess = ref(false)

const verifiedSuccess = computed(() => route.query.verified === 'true')
const isTokenExpired = computed(() => route.query.error === 'token-expired')
const tokenError = computed(() => {
  if (route.query.error === 'invalid-token') return 'Invalid verification link. Please request a new one.'
  if (isTokenExpired.value) return 'Verification link has expired.'
  return ''
})
const oauthError = computed(() => {
  if (route.query.error === 'oauth') return 'Sign-in failed. Please try again.'
  if (route.query.error === 'oauth-suspended') return 'Your account has been suspended.'
  if (route.query.error === 'oauth-domain') return 'Registration is restricted to approved email domains.'
  return ''
})

async function login() {
  loading.value = true
  error.value = ''
  isUnverified.value = false
  resendSuccess.value = false
  try {
    await $fetch('/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value }
    })
    await refreshSession()
    await navigateTo('/projects')
  } catch (e: any) {
    const msg = e.data?.message || 'Login failed'
    error.value = msg
    if (msg.includes('verify your email')) {
      isUnverified.value = true
    }
  } finally {
    loading.value = false
  }
}

async function resendVerification() {
  resendLoading.value = true
  try {
    // For expired tokens, the server reads the token from an httpOnly cookie
    // For login-based unverified, we pass the email
    const body = isTokenExpired.value ? {} : { email: email.value }
    await $fetch('/auth/resend-verification', {
      method: 'POST',
      body
    })
    resendSuccess.value = true
  } catch {
    // Endpoint always returns success
  } finally {
    resendLoading.value = false
  }
}
</script>

<template>
  <div class="auth-glass">
    <div class="px-7 pt-7 pb-2">
      <h2 class="text-base font-bold text-center tracking-[-0.02em]">Sign in to your account</h2>
    </div>

    <form class="px-7 pb-7 flex flex-col gap-5" @submit.prevent="login">
      <!-- Verification success banner -->
      <div
        v-if="verifiedSuccess"
        class="auth-field flex items-center gap-2 text-[13px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-lg px-3 py-2.5 backdrop-blur-sm border border-emerald-200/50 dark:border-emerald-800/30"
      >
        <UIcon name="i-lucide-check-circle" class="shrink-0" />
        Email verified! You can now sign in.
      </div>

      <!-- Token error banner -->
      <div
        v-if="tokenError"
        class="auth-field flex items-center gap-2 text-[13px] text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/30 rounded-lg px-3 py-2.5 backdrop-blur-sm border border-red-200/50 dark:border-red-800/30"
      >
        <UIcon name="i-lucide-alert-circle" class="shrink-0" />
        <div>
          {{ tokenError }}
          <template v-if="isTokenExpired">
            <button
              v-if="!resendSuccess"
              class="block mt-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
              type="button"
              :disabled="resendLoading"
              @click="resendVerification"
            >
              {{ resendLoading ? 'Sending...' : 'Resend verification email' }}
            </button>
            <span v-if="resendSuccess" class="block mt-1 text-emerald-600 dark:text-emerald-400">
              Verification email sent!
            </span>
          </template>
        </div>
      </div>

      <!-- OAuth error banner -->
      <AuthErrorBanner :error="oauthError" />

      <!-- Social login buttons -->
      <SocialLoginButtons />

      <UFormField label="Email" class="auth-field" style="animation-delay: 0.05s">
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

      <UFormField label="Password" class="auth-field" style="animation-delay: 0.1s">
        <UInput
          v-model="password"
          type="password"
          placeholder="Enter your password"
          icon="i-lucide-lock"
          required
          size="lg"
          class="w-full"
        />
      </UFormField>

      <div class="auth-field flex justify-end -mt-2" style="animation-delay: 0.12s">
        <NuxtLink
          to="/auth/forgot-password"
          class="text-[13px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
        >
          Forgot password?
        </NuxtLink>
      </div>

      <div
        v-if="error"
        class="auth-field flex items-center gap-2 text-[13px] text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/30 rounded-lg px-3 py-2.5 backdrop-blur-sm border border-red-200/50 dark:border-red-800/30"
      >
        <UIcon name="i-lucide-alert-circle" class="shrink-0" />
        <div>
          {{ error }}
          <button
            v-if="isUnverified && !resendSuccess"
            class="block mt-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            type="button"
            :disabled="resendLoading"
            @click="resendVerification"
          >
            {{ resendLoading ? 'Sending...' : 'Resend verification email' }}
          </button>
          <span v-if="resendSuccess" class="block mt-1 text-emerald-600 dark:text-emerald-400">
            Verification email sent!
          </span>
        </div>
      </div>

      <div class="auth-field" style="animation-delay: 0.15s">
        <UButton type="submit" label="Sign in" block :loading="loading" size="lg" />
      </div>
    </form>

    <div class="px-7 pb-6 pt-1">
      <div class="border-t border-zinc-200/40 dark:border-zinc-700/25 pt-4">
        <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400">
          Don't have an account?
          <NuxtLink to="/register" class="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">Register</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
