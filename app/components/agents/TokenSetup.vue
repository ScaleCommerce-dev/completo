<script setup lang="ts">
/**
 * Copy-ready setup for an agent's new token: the CLI, Claude Code and an
 * `.mcp.json`, filled in, because the token is on screen exactly once.
 */
const props = defineProps<{
  token: string
  agentName: string
  agentEmail: string
}>()

const SNIPPETS = [
  { value: 'cli', label: 'CLI' },
  { value: 'cc', label: 'Claude Code' },
  { value: 'json', label: 'MCP config' }
]
const tab = ref('cli')
const { copied, copy } = useCopyText()

// The app is client-only (`ssr: false`), so the origin in the address bar is the one to paste.
const origin = computed(() => window.location.origin)

const snippet = computed(() => {
  if (tab.value === 'cc') {
    return `claude mcp add --transport http completo \\\n  ${origin.value}/mcp \\\n  --header "Authorization: Bearer ${props.token}"`
  }
  if (tab.value === 'json') {
    return JSON.stringify({
      mcpServers: { completo: { type: 'http', url: `${origin.value}/mcp`, headers: { Authorization: `Bearer ${props.token}` } } }
    }, null, 2)
  }
  return `export COMPLETO_URL=${origin.value}\nexport COMPLETO_TOKEN=${props.token}\nexport COMPLETO_USER=${props.agentEmail}`
})

const help = computed(() => ({
  cli: 'Or let `completo config` save them to ~/.completo/.env on the agent\'s machine. COMPLETO_USER is what --me resolves to.',
  cc: `Run it where the agent works. Everything it does through MCP shows as ${props.agentName}.`,
  json: 'For .mcp.json, or any MCP client that takes a URL and a header.'
}[tab.value]))
</script>

<template>
  <div class="mt-3 pt-3 border-t border-success/20">
    <div class="flex flex-wrap items-center gap-2">
      <UiSectionLabel
        label="Use it"
        icon="i-lucide-terminal"
      />
      <UTabs
        v-model="tab"
        :items="SNIPPETS"
        :content="false"
        size="xs"
        class="ml-auto"
      />
    </div>
    <div class="relative mt-2">
      <pre class="rounded-md border border-default bg-default px-3 py-2.5 pr-20 text-xs font-mono text-default overflow-x-auto thin-scroll">{{ snippet }}</pre>
      <UButton
        :label="copied ? 'Copied!' : 'Copy'"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        variant="ghost"
        color="neutral"
        size="xs"
        class="absolute top-1.5 right-1.5"
        :class="copied ? 'text-success! bg-success/10' : ''"
        :aria-label="`Copy the ${SNIPPETS.find(s => s.value === tab)?.label} setup`"
        @click="copy(snippet)"
      />
    </div>
    <p class="mt-1.5 text-xs text-dimmed leading-relaxed">
      {{ help }}
    </p>
  </div>
</template>
