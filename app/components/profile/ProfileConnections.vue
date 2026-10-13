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

async function load() {
  try {
    grants.value = await $fetch<Grant[]>('/api/user/oauth-grants')
  } catch {
    grants.value = []
  }
}

onMounted(load)

async function revoke(id: string) {
  disarm()
  try {
    await $fetch(`/api/user/oauth-grants/${id}`, { method: 'DELETE' })
  } finally {
    await load()
  }
}

function when(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="mt-6 rounded-xl border border-default bg-default shadow-raise overflow-hidden">
    <div class="px-5 pt-4 pb-2 flex items-center gap-2">
      <UIcon
        name="i-lucide-plug-zap"
        class="text-base text-dimmed"
      />
      <span class="text-xs font-semibold uppercase tracking-label text-dimmed">Connected apps</span>
    </div>

    <div class="px-5 pb-4">
      <p class="text-sm text-dimmed leading-relaxed">
        Apps that signed in to your account through Claude's connector sign-in. Each one acts as you until you disconnect it here.
      </p>
    </div>

    <div
      v-if="grants.length"
      class="mx-5 mb-5 rounded-lg border border-default divide-y divide-default overflow-hidden"
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
