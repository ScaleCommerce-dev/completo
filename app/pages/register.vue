<script setup lang="ts">
import { DOMAIN_RESTRICTED_MESSAGE } from '#shared/utils/auth-messages'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const invitationToken = computed(() => route.query.invitation as string || '')
const oauthError = computed(() => {
  if (route.query.error === 'oauth') return 'Sign-in failed. Please try again.'
  if (route.query.error === 'oauth-suspended') return 'Your account has been suspended.'
  if (route.query.error === 'oauth-domain') return DOMAIN_RESTRICTED_MESSAGE
  return ''
})

const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const registrationComplete = ref(false)

// Invitation context
const invitationInfo = ref<{ email: string, projectName: string, inviterName: string } | null>(null)
const invitationLoading = ref(false)

// Fetch invitation info if token present
async function loadInvitation() {
  if (!invitationToken.value) return
  invitationLoading.value = true
  try {
    const info = await $fetch<{ email: string, projectName: string, inviterName: string }>(`/api/invitations/${invitationToken.value}`)
    invitationInfo.value = info
    email.value = info.email
  } catch {
    // Invalid/expired token — fall through to normal registration
  } finally {
    invitationLoading.value = false
  }
}

onMounted(loadInvitation)

async function register() {
  loading.value = true
  error.value = ''
  try {
    const body: Record<string, string> = { name: name.value, email: email.value, password: password.value }
    if (invitationToken.value) {
      body.invitation = invitationToken.value
    }
    const result = await $fetch<{ requiresVerification: boolean }>('/auth/register', {
      method: 'POST',
      body
    })

    if (result.requiresVerification === false) {
      // Invitation-based registration: already verified + signed in
      const { fetch: refreshSession } = useUserSession()
      await refreshSession()
      navigateTo('/projects')
      return
    }

    registrationComplete.value = true
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Registration failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- Check your email confirmation -->
  <div
    v-if="registrationComplete"
    class="auth-glass"
  >
    <div class="px-7 py-7 flex flex-col items-center gap-4 text-center">
      <div class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <UIcon
          name="i-lucide-mail-check"
          class="text-success text-xl"
        />
      </div>
      <h2 class="text-base font-bold tracking-[-0.02em]">
        Check your email
      </h2>
      <p class="text-sm text-muted">
        We sent a verification link to <span class="font-semibold text-default">{{ email }}</span>.
        Click the link to activate your account.
      </p>
      <div class="border-t border-muted pt-4 mt-2 w-full">
        <p class="text-sm text-muted">
          Already verified?
          <NuxtLink
            to="/login"
            class="text-primary font-semibold hover:underline"
          >Sign in</NuxtLink>
        </p>
      </div>
    </div>
  </div>

  <!-- Registration form -->
  <div
    v-else
    class="auth-glass"
  >
    <div class="px-7 pt-7 pb-2">
      <h2 class="text-base font-bold text-center tracking-[-0.02em]">
        Create your account
      </h2>
    </div>

    <!-- Invitation banner -->
    <div
      v-if="invitationInfo"
      class="mx-7 mb-2 flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-primary/15 bg-primary/10 border border-primary/50 border-primary/30"
    >
      <UIcon
        name="i-lucide-mail-plus"
        class="text-primary shrink-0"
      />
      <span class="text-sm text-primary">
        You've been invited to <strong>{{ invitationInfo.projectName }}</strong>
      </span>
    </div>

    <form
      class="px-7 pb-7 flex flex-col gap-5"
      @submit.prevent="register"
    >
      <!-- OAuth error banner -->
      <AuthErrorBanner :message="oauthError" />

      <!-- Social login buttons -->
      <SocialLoginButtons />

      <UFormField
        label="Name"
        class="auth-field"
        style="animation-delay: 0.05s"
      >
        <UInput
          v-model="name"
          placeholder="Your name"
          icon="i-lucide-user"
          required
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Email"
        class="auth-field"
        style="animation-delay: 0.1s"
      >
        <UInput
          v-model="email"
          type="email"
          placeholder="you@example.com"
          icon="i-lucide-mail"
          required
          size="lg"
          class="w-full"
          :readonly="!!invitationInfo"
        />
      </UFormField>

      <UFormField
        label="Password"
        class="auth-field"
        style="animation-delay: 0.15s"
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

      <AuthErrorBanner :message="error" />

      <div
        class="auth-field"
        style="animation-delay: 0.2s"
      >
        <UButton
          type="submit"
          label="Create account"
          block
          :loading="loading"
          size="lg"
        />
      </div>
    </form>

    <div class="px-7 pb-6 pt-1">
      <div class="border-t border-muted pt-4">
        <p class="text-sm text-center text-muted">
          Already have an account?
          <NuxtLink
            to="/login"
            class="text-primary font-semibold hover:underline"
          >Sign in</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
