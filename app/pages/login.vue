<script setup lang="ts">
import { DOMAIN_RESTRICTED_MESSAGE } from '#shared/utils/auth-messages'

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
  if (route.query.error === 'oauth-domain') return DOMAIN_RESTRICTED_MESSAGE
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
  } catch (e: unknown) {
    const msg = getErrorMessage(e, 'Login failed')
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
      <h2 class="text-base font-bold text-center tracking-heading">
        Sign in to your account
      </h2>
    </div>

    <form
      class="px-7 pb-7 flex flex-col gap-5"
      @submit.prevent="login"
    >
      <AuthErrorBanner
        v-if="verifiedSuccess"
        tone="success"
        message="Email verified. You can sign in now."
      />

      <AuthErrorBanner v-if="tokenError">
        {{ tokenError }}
        <template v-if="isTokenExpired">
          <UButton
            v-if="!resendSuccess"
            label="Resend verification email"
            variant="link"
            size="sm"
            class="block mt-1 px-0"
            :loading="resendLoading"
            @click="resendVerification"
          />
          <span
            v-if="resendSuccess"
            class="block mt-1 text-success"
          >Verification email sent.</span>
        </template>
      </AuthErrorBanner>

      <!-- OAuth error banner -->
      <AuthErrorBanner :message="oauthError" />

      <!-- Social login buttons -->
      <SocialLoginButtons />

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

      <UFormField
        label="Password"
        class="auth-field"
        style="animation-delay: 0.1s"
      >
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

      <div
        class="auth-field flex justify-end -mt-2"
        style="animation-delay: 0.12s"
      >
        <NuxtLink
          to="/auth/forgot-password"
          class="text-sm text-primary font-semibold hover:underline"
        >
          Forgot password?
        </NuxtLink>
      </div>

      <AuthErrorBanner v-if="error">
        {{ error }}
        <UButton
          v-if="isUnverified && !resendSuccess"
          label="Resend verification email"
          variant="link"
          size="sm"
          class="block mt-1 px-0"
          :loading="resendLoading"
          @click="resendVerification"
        />
        <span
          v-if="resendSuccess"
          class="block mt-1 text-success"
        >Verification email sent.</span>
      </AuthErrorBanner>

      <div
        class="auth-field"
        style="animation-delay: 0.15s"
      >
        <UButton
          type="submit"
          label="Sign in"
          block
          :loading="loading"
          size="lg"
        />
      </div>
    </form>

    <div class="px-7 pb-6 pt-1">
      <div class="border-t border-muted pt-4">
        <p class="text-sm text-center text-muted">
          Don't have an account?
          <NuxtLink
            to="/register"
            class="text-primary font-semibold hover:underline"
          >Register</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
