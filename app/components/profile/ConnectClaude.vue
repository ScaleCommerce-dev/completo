<script setup lang="ts">
/**
 * The three connector fields and the one command, filled in.
 *
 * Shown only inside the created-token banner, because that is the only moment
 * the raw token exists on screen: once the banner is dismissed the token is
 * gone for good, and so is this. Everything here is what claude.ai's custom
 * connector dialog asks for, in its words (URL, header name, header value), so
 * the user copies three fields across rather than assembling "Bearer " plus a
 * token plus "/mcp" by hand. The Claude Code line is the same three in one.
 *
 * One copied-state for all rows rather than a `useCopyText` per row: the rows
 * share one timer, so copying the next field ends the previous "Copied" at once
 * instead of leaving two ticks on screen.
 */
const props = defineProps<{ token: string }>()

// The app is client-only (`ssr: false`), so the origin the user is looking at is the one to paste.
const serverUrl = computed(() => `${import.meta.client ? window.location.origin : ''}/mcp`)
const headerValue = computed(() => `Bearer ${props.token}`)
const claudeCodeCommand = computed(() =>
  `claude mcp add --transport http completo ${serverUrl.value} --header "Authorization: ${headerValue.value}"`
)

const rows = computed(() => [
  { key: 'url', label: 'Server URL', value: serverUrl.value },
  { key: 'name', label: 'Header name', value: 'Authorization' },
  { key: 'value', label: 'Header value', value: headerValue.value }
])

const copiedKey = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

async function copy(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  copiedKey.value = key
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    copiedKey.value = null
  }, 2000)
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="mt-3 pt-3 border-t border-success/20">
    <UiSectionLabel
      label="Connect Claude"
      icon="i-lucide-sparkles"
    />
    <p class="mt-1.5 text-xs text-dimmed leading-relaxed">
      In Claude open Customize, then Connectors, then Add custom connector. Choose No sign in and fill in these three fields.
    </p>

    <div class="mt-2 rounded-lg border border-default bg-default overflow-hidden">
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex items-center gap-2 px-3 py-2 border-b border-default last:border-b-0"
      >
        <span class="w-24 shrink-0 text-xs font-medium text-muted">{{ row.label }}</span>
        <code class="flex-1 min-w-0 text-xs font-mono text-default truncate select-all">{{ row.value }}</code>
        <UButton
          :label="copiedKey === row.key ? 'Copied!' : 'Copy'"
          :icon="copiedKey === row.key ? 'i-lucide-check' : 'i-lucide-copy'"
          :aria-label="`Copy ${row.label.toLowerCase()}`"
          variant="ghost"
          color="neutral"
          size="xs"
          class="shrink-0"
          :class="copiedKey === row.key ? 'text-success! bg-success/10' : ''"
          @click="copy(row.key, row.value)"
        />
      </div>
    </div>

    <p class="mt-3 text-xs text-dimmed leading-relaxed">
      Claude Code and other MCP clients take the same URL and header in one command.
    </p>
    <div class="mt-1.5 flex items-center gap-2 rounded-lg border border-default bg-default px-3 py-2">
      <code class="flex-1 min-w-0 text-xs font-mono text-default truncate select-all">{{ claudeCodeCommand }}</code>
      <UButton
        :label="copiedKey === 'cli' ? 'Copied!' : 'Copy'"
        :icon="copiedKey === 'cli' ? 'i-lucide-check' : 'i-lucide-copy'"
        aria-label="Copy Claude Code command"
        variant="ghost"
        color="neutral"
        size="xs"
        class="shrink-0"
        :class="copiedKey === 'cli' ? 'text-success! bg-success/10' : ''"
        @click="copy('cli', claudeCodeCommand)"
      />
    </div>
  </div>
</template>
