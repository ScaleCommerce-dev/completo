<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const route = useRoute()
const token = computed(() => route.query.token as string || '')

const name = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function setupAccount() {
  if (!token.value) {
    error.value = 'Invalid setup link'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await $fetch('/auth/setup-account', {
      method: 'POST',
      body: { token: token.value, password: password.value, name: name.value.trim() || undefined }
    })
    const { fetch: refreshSession } = useUserSession()
    await refreshSession()
    navigateTo('/projects')
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to set up account')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-glass">
    <div class="pt-7 pb-2">
      <h2 class="auth-title">
        Set up your account
      </h2>
      <p class="text-base text-muted">
        Enter your name and choose a password
      </p>
    </div>

    <form
      class="pb-7 flex flex-col gap-5"
      @submit.prevent="setupAccount"
    >
      <UFormField
        label="Name"
      >
        <UInput
          v-model="name"
          placeholder="Your name"
          icon="i-lucide-user"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Password"
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

      <div>
        <UButton
          type="submit"
          label="Set password and sign in"
          block
          :loading="loading"
          size="lg"
          :disabled="!token"
        />
      </div>
    </form>

    <AuthFooter
      prompt="Already have a password?"
      to="/login"
      label="Sign in"
    />
  </div>
</template>
