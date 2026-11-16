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

const info = ref<{ clientName: string, redirectHost: string, clientHost: string | null } | null>(null)

/**
 * What the page is named by: the host the code is sent to. The client's name is
 * whatever it registered, so anyone can call themselves "Claude"; anyone who
 * gets the code has the account, and the redirect host is where it goes. The
 * name is shown, in quotes, as the app's own claim.
 */
const destination = computed(() => info.value?.redirectHost ?? '')
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
    <div class="pt-7 pb-2">
      <h2 class="auth-title">
        {{ info ? `Connect ${destination}` : 'Connect an app' }}
      </h2>
    </div>

    <div class="pb-7 flex flex-col gap-5">
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
          An app at <span class="font-medium text-default">{{ destination }}</span>, which calls itself
          <span class="font-medium text-default">"{{ info.clientName }}"</span>, wants to use Completo as you. It will be able to read and change every project you belong to, exactly as you can, until you disconnect it on your profile page.
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

        <div class="flex items-start gap-2 rounded-lg border border-default bg-muted px-3 py-2.5 text-sm text-default">
          <UIcon
            name="i-lucide-globe"
            class="text-base text-dimmed shrink-0 mt-0.5"
          />
          <p class="min-w-0">
            Allow sends you, and access to your account, to
            <span class="font-mono font-medium break-all">{{ info.redirectHost }}</span>.
            <span
              v-if="info.clientHost && info.clientHost !== info.redirectHost"
              class="block text-muted"
            >The app describes itself at <span class="font-mono break-all">{{ info.clientHost }}</span>.</span>
            <span class="block text-muted">Only allow it if you recognise this address. The name above is the app's own claim.</span>
          </p>
        </div>

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
