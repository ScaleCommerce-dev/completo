<script setup lang="ts">
import type { InterfaceMode } from '#shared/utils/workspace-settings'

definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Settings · Completo' })

const { data: settings, refresh } = await useFetch<{ allowedEmailDomains: string[], interfaceMode: InterfaceMode, issueTemplate: string }>('/api/admin/settings')

// The copy every signed-in page reads; written back on save, so the new
// interface and template apply in this session without a reload.
const { settings: workspace } = useWorkspaceSettings()

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

// ─── Interface ──────────────────────────────────────────────────────────────

const INTERFACE_OPTIONS = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'Boards and lists, with cards opening in the panel beside them.'
  },
  {
    value: 'tracker',
    label: 'Tracker',
    description: 'Issue lists grouped by status, a full page per issue with sub-issues and relations, and project overviews with milestones. Boards stay one click away.'
  }
]

const interfaceInput = ref<InterfaceMode>('standard')
const interfaceSaving = ref(false)
const interfaceError = ref('')
const interfaceSaved = ref(false)

watch(() => settings.value?.interfaceMode, (val) => {
  if (val) interfaceInput.value = val
}, { immediate: true })

const interfaceChanged = computed(() => interfaceInput.value !== (settings.value?.interfaceMode ?? 'standard'))

async function saveInterface() {
  interfaceSaving.value = true
  interfaceError.value = ''
  interfaceSaved.value = false
  try {
    const result = await $fetch<{ interfaceMode: InterfaceMode, issueTemplate: string }>('/api/admin/settings', {
      method: 'PUT',
      body: { interfaceMode: interfaceInput.value }
    })
    workspace.value = { interfaceMode: result.interfaceMode, issueTemplate: result.issueTemplate }
    await refresh()
    interfaceSaved.value = true
    setTimeout(() => {
      interfaceSaved.value = false
    }, 3000)
  } catch (e: unknown) {
    interfaceError.value = getErrorMessage(e, 'Failed to save the interface')
  } finally {
    interfaceSaving.value = false
  }
}

// ─── Issue template ─────────────────────────────────────────────────────────

const templateInput = ref('')
const templateSaving = ref(false)
const templateError = ref('')
const templateSaved = ref(false)

watch(() => settings.value?.issueTemplate, (val) => {
  if (val !== undefined) templateInput.value = val
}, { immediate: true })

const templateChanged = computed(() => templateInput.value !== (settings.value?.issueTemplate ?? ''))

async function saveTemplate() {
  templateSaving.value = true
  templateError.value = ''
  templateSaved.value = false
  try {
    const result = await $fetch<{ interfaceMode: InterfaceMode, issueTemplate: string }>('/api/admin/settings', {
      method: 'PUT',
      body: { issueTemplate: templateInput.value }
    })
    workspace.value = { interfaceMode: result.interfaceMode, issueTemplate: result.issueTemplate }
    await refresh()
    templateSaved.value = true
    setTimeout(() => {
      templateSaved.value = false
    }, 3000)
  } catch (e: unknown) {
    templateError.value = getErrorMessage(e, 'Failed to save the issue template')
  } finally {
    templateSaving.value = false
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
          <h2 class="text-base font-bold tracking-name text-highlighted">
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
            :loading="saving"
            :disabled="!hasChanges"
            @click="save"
          />
        </div>
      </template>
    </UCard>
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-layout-panel-left"
            class="text-base text-primary"
          />
          <h2 class="text-base font-bold tracking-name text-highlighted">
            Interface
          </h2>
        </div>
        <p class="text-sm text-muted mt-1 leading-relaxed">
          How everyone in this workspace works with projects and cards. Both show the same data,
          so switching back and forth loses nothing.
        </p>
      </template>

      <URadioGroup
        v-model="interfaceInput"
        :items="INTERFACE_OPTIONS"
        aria-label="Interface"
        variant="card"
        :ui="{ fieldset: 'gap-2' }"
      />

      <UAlert
        v-if="interfaceError"
        class="mt-3"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :description="interfaceError"
      />

      <UAlert
        v-if="interfaceSaved"
        class="mt-3"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        description="Interface saved"
      />

      <template #footer>
        <div class="flex justify-end">
          <UButton
            label="Save changes"
            :loading="interfaceSaving"
            :disabled="!interfaceChanged"
            @click="saveInterface"
          />
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-file-text"
            class="text-base text-primary"
          />
          <h2 class="text-base font-bold tracking-name text-highlighted">
            Issue template
          </h2>
        </div>
        <p class="text-sm text-muted mt-1 leading-relaxed">
          Every new issue created in the New issue dialog, and through MCP without a description,
          starts with this description. Markdown. Leave empty for none.
        </p>
      </template>

      <UFormField label="Template">
        <UTextarea
          v-model="templateInput"
          :rows="10"
          class="w-full"
          :ui="{ base: 'font-mono resize-y leading-relaxed' }"
        />
      </UFormField>

      <UAlert
        v-if="templateError"
        class="mt-3"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :description="templateError"
      />

      <UAlert
        v-if="templateSaved"
        class="mt-3"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        description="Issue template saved"
      />

      <template #footer>
        <div class="flex justify-end">
          <UButton
            label="Save changes"
            :loading="templateSaving"
            :disabled="!templateChanged"
            @click="saveTemplate"
          />
        </div>
      </template>
    </UCard>
  </UiPage>
</template>
