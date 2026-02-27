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
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to set up account'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-glass">
    <div class="px-7 pt-7 pb-2">
      <h2 class="text-base font-bold text-center tracking-[-0.02em]">Set up your account</h2>
      <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400 mt-1">Enter your name and choose a password</p>
    </div>

    <form class="px-7 pb-7 flex flex-col gap-5" @submit.prevent="setupAccount">
      <UFormField label="Name" class="auth-field" style="animation-delay: 0.05s">
        <UInput
          v-model="name"
          placeholder="Your name"
          icon="i-lucide-user"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Password" class="auth-field" style="animation-delay: 0.1s">
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

      <div class="auth-field" style="animation-delay: 0.15s">
        <UButton type="submit" label="Set Password & Sign In" block :loading="loading" size="lg" :disabled="!token" />
      </div>
    </form>

    <div class="px-7 pb-6 pt-1">
      <div class="border-t border-zinc-200/40 dark:border-zinc-700/25 pt-4">
        <p class="text-[13px] text-center text-zinc-500 dark:text-zinc-400">
          Already have a password?
          <NuxtLink to="/login" class="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">Sign in</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
