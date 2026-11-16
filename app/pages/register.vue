<script setup lang="ts">
import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-messages'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const invitationToken = computed(() => route.query.invitation as string || '')
const oauthError = useOAuthError()

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
  <AuthCheckEmail
    v-if="registrationComplete"
    prompt="Already verified?"
    to="/login"
    label="Sign in"
  >
    We sent a verification link to <span class="font-semibold text-default">{{ email }}</span>.
    Click the link to activate your account.
  </AuthCheckEmail>

  <div
    v-else
    class="auth-glass"
  >
    <!-- Registration form -->
    <div class="pt-7 pb-2">
      <h2 class="auth-title">
        Create your account
      </h2>
    </div>

    <!-- Invitation banner -->
    <div
      v-if="invitationInfo"
      class="mx-7 mb-2 flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-primary/15 border border-primary/50"
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
      class="pb-7 flex flex-col gap-5"
      @submit.prevent="register"
    >
      <!-- OAuth error banner -->
      <AuthErrorBanner :message="oauthError" />

      <!-- Social login buttons -->
      <SocialLoginButtons />

      <UFormField
        label="Name"
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
          label="Create account"
          block
          :loading="loading"
          size="lg"
        />
      </div>
    </form>

    <AuthFooter
      prompt="Already have an account?"
      to="/login"
      label="Sign in"
    />
  </div>
</template>
