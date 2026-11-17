<script setup lang="ts">
/**
 * Apps signed in through OAuth: one row per sign-in, each revocable. The
 * two-step revoke is `useArmedDelete`, the same as the token list above it.
 */
interface Grant {
  id: string
  clientName: string
  createdAt: string
  lastUsedAt: string | null
}

const grants = ref<Grant[]>([])
const { armedId, arm, disarm } = useArmedDelete()
const toast = useToast()

/**
 * A failed read is said, not shown as an empty list: "no connected apps" is a
 * claim about what can act as you, and an outage is no basis for it.
 */
const loadError = ref<unknown>(null)

async function load() {
  try {
    grants.value = await $fetch<Grant[]>('/api/user/oauth-grants')
    loadError.value = null
  } catch (e) {
    loadError.value = e
  }
}

onMounted(load)

async function revoke(id: string) {
  disarm()
  try {
    await $fetch(`/api/user/oauth-grants/${id}`, { method: 'DELETE' })
  } catch (e) {
    // Said out loud: a disconnect that silently failed leaves an app acting as you.
    toast.add({ title: 'Failed to disconnect', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
  } finally {
    await load()
  }
}

function when(iso: string | null): string {
  if (!iso) return 'never'
  return formatDate(iso)
}
</script>

<template>
  <div class="mt-6 rounded-xl border border-default bg-default shadow-raise overflow-hidden">
    <div class="px-card pt-4 pb-2 flex items-center gap-2">
      <UIcon
        name="i-lucide-plug-zap"
        class="text-base text-dimmed"
      />
      <UiSectionLabel label="Connected apps" />
    </div>

    <div class="px-card pb-4">
      <p class="text-sm text-dimmed leading-relaxed">
        Apps that signed in to your account through Claude's connector sign-in. Each one acts as you until you disconnect it here.
      </p>
    </div>

    <UiLoadError
      v-if="loadError"
      what="connected apps"
      :error="loadError"
      class="py-6"
      @retry="load"
    />
    <div
      v-else-if="grants.length"
      class="mx-card mb-5 rounded-lg border border-default divide-y divide-default overflow-hidden"
    >
      <div
        v-for="grant in grants"
        :key="grant.id"
        class="flex items-center gap-3 px-3 py-2.5 bg-default"
      >
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-default truncate">
            {{ grant.clientName }}
          </div>
          <div class="text-xs text-dimmed">
            Connected {{ when(grant.createdAt) }}, last used {{ when(grant.lastUsedAt) }}
          </div>
        </div>
        <template v-if="armedId === grant.id">
          <UButton
            label="Disconnect"
            color="error"
            size="xs"
            @click="revoke(grant.id)"
          />
          <UButton
            label="Keep"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="disarm()"
          />
        </template>
        <UButton
          v-else
          label="Disconnect"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="arm(grant.id)"
        />
      </div>
    </div>
  </div>
</template>
