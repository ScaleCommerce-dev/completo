<script setup lang="ts">
/**
 * The consent page: an MCP client (Claude, usually) has sent the user here to
 * sign in, and this is the one question Completo asks before handing it a
 * token. The request itself is checked server-side on both reads: once to show
 * who is asking, once more on the decision, so the page carries nothing it
 * could have tampered with.
 *
 * On the auth layout because it is a doorway, not a workspace: the brand is the
 * content, as on login.
 */
definePageMeta({ layout: 'auth' })

const route = useRoute()
const { user } = useUserSession()

const info = ref<{ clientName: string, redirectHost: string } | null>(null)
const error = ref('')
const loading = ref(true)
const submitting = ref<'allow' | 'deny' | null>(null)

/** The OAuth request, as it arrived. Only string params exist in it; anything else is noise. */
const params = computed(() => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
})

onMounted(async () => {
  try {
    info.value = await $fetch('/api/oauth/authorize', { query: params.value })
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'This sign-in request is not valid.')
  } finally {
    loading.value = false
  }
})

async function decide(decision: 'allow' | 'deny') {
  submitting.value = decision
  try {
    const { redirectTo } = await $fetch<{ redirectTo: string }>('/api/oauth/authorize', {
      method: 'POST',
      body: { ...params.value, decision }
    })
    window.location.assign(redirectTo)
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'This sign-in request is not valid.')
    submitting.value = null
  }
}
</script>

<template>
  <div class="auth-glass">
    <div class="px-7 pt-7 pb-2">
      <h2 class="text-base font-bold text-center tracking-heading">
        {{ info ? `Connect ${info.clientName}` : 'Connect an app' }}
      </h2>
    </div>

    <div class="px-7 pb-7 flex flex-col gap-5">
      <AuthErrorBanner
        v-if="error"
        :message="error"
      />

      <template v-else-if="loading">
        <p class="text-sm text-muted text-center">
          Checking the request...
        </p>
      </template>

      <template v-else-if="info">
        <p class="text-sm text-muted leading-relaxed">
          <span class="font-medium text-default">{{ info.clientName }}</span>
          wants to use Completo as you. It will be able to read and change every project you belong to, exactly as you can, until you disconnect it on your profile page.
        </p>

        <div class="flex items-center gap-3 rounded-lg border border-default bg-default px-3 py-2.5">
          <UiAvatar
            :alt="user?.name"
            :src="user?.avatarUrl || undefined"
            size="sm"
          />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-default truncate">
              {{ user?.name }}
            </div>
            <div class="text-xs text-dimmed truncate">
              {{ user?.email }}
            </div>
          </div>
          <NuxtLink
            to="/logout"
            class="text-xs font-medium text-dimmed hover:text-toned transition-colors shrink-0"
          >
            Not you?
          </NuxtLink>
        </div>

        <p class="text-xs text-dimmed">
          You will be sent back to {{ info.redirectHost }}.
        </p>

        <div class="flex items-center gap-2">
          <UButton
            label="Allow"
            block
            :loading="submitting === 'allow'"
            :disabled="submitting !== null"
            @click="decide('allow')"
          />
          <UButton
            label="Deny"
            variant="ghost"
            color="neutral"
            block
            :loading="submitting === 'deny'"
            :disabled="submitting !== null"
            @click="decide('deny')"
          />
        </div>
      </template>
    </div>
  </div>
</template>
