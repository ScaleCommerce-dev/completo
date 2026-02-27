<script setup lang="ts">
definePageMeta({ layout: 'default' })

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
  <div class="p-6 max-w-3xl h-full overflow-y-auto">
    <div class="flex items-start justify-between mb-8">
      <div>
        <h1 class="text-xl font-extrabold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
          Global Settings
        </h1>
        <p class="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          System-wide configuration for your Completo instance
        </p>
      </div>
      <NotificationBell />
    </div>

    <!-- Allowed Email Domains Section -->
    <div class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 p-5">
      <div class="flex items-center gap-2 mb-1">
        <UIcon
          name="i-lucide-shield"
          class="text-[16px] text-indigo-500"
        />
        <h2 class="text-[15px] font-bold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
          Allowed Email Domains
        </h2>
      </div>
      <p class="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
        Restrict registration to specific email domains. Leave empty to allow all domains.
      </p>

      <div>
        <label class="block text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500 mb-1.5">
          Domains (one per line)
        </label>
        <textarea
          v-model="domainsInput"
          rows="5"
          placeholder="example.com&#10;company.org"
          class="w-full px-3 py-2 text-[13px] font-mono text-zinc-700 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-lg outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors resize-y leading-relaxed"
        />
        <p class="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
          Only users with email addresses at these domains will be able to register.
          Empty list means anyone can register.
        </p>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="text-[14px] text-red-500 shrink-0"
        />
        <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ error }}</span>
      </div>

      <!-- Success -->
      <div
        v-if="success"
        class="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40"
      >
        <UIcon
          name="i-lucide-check-circle"
          class="text-[14px] text-emerald-500 shrink-0"
        />
        <span class="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Settings saved</span>
      </div>

      <!-- Save button -->
      <div class="flex items-center justify-end mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-700/40">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="saving || !hasChanges"
          @click="save"
        >
          <UIcon
            v-if="saving"
            name="i-lucide-loader-2"
            class="text-[14px] animate-spin"
          />
          <UIcon
            v-else
            name="i-lucide-save"
            class="text-[14px]"
          />
          Save Changes
        </button>
      </div>
    </div>
  </div>
</template>
