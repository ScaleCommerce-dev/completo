<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Settings · Completo' })

const { data: settings, refresh } = await useFetch<{ allowedEmailDomains: string[] }>('/api/admin/settings')

const domainsInput = ref('')
const saving = ref(false)
const error = ref('')
const success = ref(false)

watch(() => settings.value, (val) => {
  if (val) {
    domainsInput.value = val.allowedEmailDomains.join('\n')
  }
}, { immediate: true })

async function save() {
  saving.value = true
  error.value = ''
  success.value = false

  try {
    const domains = domainsInput.value
      .split('\n')
      .map(d => d.trim())
      .filter(Boolean)

    await $fetch('/api/admin/settings', {
      method: 'PUT',
      body: { allowedEmailDomains: domains }
    })

    await refresh()
    success.value = true
    setTimeout(() => {
      success.value = false
    }, 3000)
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to save settings')
  } finally {
    saving.value = false
  }
}

const hasChanges = computed(() => {
  const current = (settings.value?.allowedEmailDomains || []).join('\n')
  const edited = domainsInput.value.split('\n').map(d => d.trim()).filter(Boolean).join('\n')
  return current !== edited
})
</script>

<template>
  <UiPage
    title="Settings"
    description="Instance-wide configuration"
    width="narrow"
  >
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-shield"
            class="text-base text-primary"
          />
          <h2 class="text-base font-bold tracking-[-0.01em] text-highlighted">
            Allowed email domains
          </h2>
        </div>
        <p class="text-sm text-muted mt-1 leading-relaxed">
          Restrict registration to specific email domains. Leave empty to allow any domain.
          Invitations and admin-created accounts bypass this list.
        </p>
      </template>

      <UFormField
        label="Domains (one per line)"
        help="Only people with an address at one of these domains can register themselves."
      >
        <UTextarea
          v-model="domainsInput"
          :rows="5"
          placeholder="example.com&#10;company.org"
          class="w-full"
          :ui="{ base: 'font-mono resize-y leading-relaxed' }"
        />
      </UFormField>

      <UAlert
        v-if="error"
        class="mt-3"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :description="error"
      />

      <UAlert
        v-if="success"
        class="mt-3"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        description="Settings saved"
      />

      <template #footer>
        <div class="flex justify-end">
          <UButton
            label="Save changes"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!hasChanges"
            @click="save"
          />
        </div>
      </template>
    </UCard>
  </UiPage>
</template>
