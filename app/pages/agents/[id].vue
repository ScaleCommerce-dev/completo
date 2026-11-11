<script setup lang="ts">
import type { AgentDetail } from '~/types/agent'

definePageMeta({ layout: 'default' })

/**
 * One agent: who it is, its tokens, its projects, and the two ways to stop it.
 *
 * Edits commit per field, with no Save and no Cancel: this is something that
 * already exists, so leaving the page is done (the first commit contract in
 * CLAUDE.md). Name and description are seamless fields that commit on blur or
 * Enter and revert on Escape; the colour commits on pick.
 *
 * The token block is the profile's (`ProfileTokens`, through `useApiTokens`)
 * pointed at this agent, and the one-time reveal adds what the profile's has in
 * prose: copy-ready setup for the CLI, Claude Code and an `.mcp.json`, filled in,
 * because the token exists on screen exactly once.
 *
 * The manager and admins reach this page; only admins transfer. An agent with no
 * manager cannot be woken until an admin gives it one, since an active agent
 * nobody is responsible for is the thing the hand-over exists to prevent.
 */
const route = useRoute()
const toast = useToast()
const { user } = useUserSession()
const isAdmin = computed(() => !!user.value?.isAdmin)
const agentId = route.params.id as string

const { data: agent, refresh, error: fetchError } = useFetch<AgentDetail>(`/api/agents/${agentId}`)
watch(fetchError, (err) => {
  if (err) showError(err)
}, { immediate: true })

useSeoMeta({ title: () => `${agent.value?.name ?? 'Agent'} · Agents · Completo` })

// ─── Fields, committed one at a time ─────────────────────────────────────────
const nameDraft = ref('')
const descriptionDraft = ref('')
watch(agent, (a) => {
  if (!a) return
  nameDraft.value = a.name
  descriptionDraft.value = a.description ?? ''
}, { immediate: true })

async function patch(fields: Record<string, unknown>, failure: string) {
  try {
    agent.value = await $fetch<AgentDetail>(`/api/agents/${agentId}`, { method: 'PATCH', body: fields })
    return true
  } catch (e: unknown) {
    toast.add({ title: failure, description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    return false
  }
}

async function commitName() {
  const next = nameDraft.value.trim()
  if (!agent.value || next === agent.value.name) return
  if (!next || !await patch({ name: next }, 'Could not rename the agent')) nameDraft.value = agent.value.name
}

async function commitDescription() {
  const next = descriptionDraft.value.trim()
  if (!agent.value || next === (agent.value.description ?? '')) return
  if (!await patch({ description: next || null }, 'Could not save the description')) descriptionDraft.value = agent.value.description ?? ''
}

function revert(field: 'name' | 'description', e: KeyboardEvent) {
  if (field === 'name') nameDraft.value = agent.value?.name ?? ''
  else descriptionDraft.value = agent.value?.description ?? ''
  const input = e.target as HTMLInputElement
  input.blur()
}

const colorOpen = ref(false)
async function commitColor(color: string) {
  if (!agent.value || color === agent.value.color) return
  await patch({ color }, 'Could not change the colour')
}

// ─── Tokens ──────────────────────────────────────────────────────────────────
const {
  tokens,
  tokenName,
  tokenExpiry,
  tokenLoading,
  createdToken,
  createdTokenName,
  tokenCopied,
  deletingTokenId,
  createToken,
  copyToken,
  startDeleteToken,
  cancelDeleteToken,
  confirmDeleteToken,
  formatTokenDate
} = useApiTokens({
  endpoint: `/api/agents/${agentId}/tokens`,
  // The list is the agent's own, so every refresh of the agent (a suspend, an
  // unsuspend, a transfer) moves it, and the token count everywhere on this page.
  list: { tokens: computed(() => agent.value?.tokens ?? []), reload: refresh }
})

const tokenInput = useTemplateRef<HTMLInputElement>('tokenInput')

// Landing here from Create: an agent with no token can do nothing yet.
onMounted(() => {
  if (route.query.new) nextTick(() => tokenInput.value?.focus())
})

const SNIPPETS = [
  { value: 'cli', label: 'CLI' },
  { value: 'cc', label: 'Claude Code' },
  { value: 'json', label: 'MCP config' }
]
const snippetTab = ref('cli')
const { copied: snippetCopied, copy: copySnippet } = useCopyText()

// The app is client-only (`ssr: false`), so the origin in the address bar is the one to paste.
const origin = computed(() => (import.meta.client ? window.location.origin : ''))

const snippet = computed(() => {
  const token = createdToken.value ?? ''
  if (snippetTab.value === 'cc') {
    return `claude mcp add --transport http completo \\\n  ${origin.value}/mcp \\\n  --header "Authorization: Bearer ${token}"`
  }
  if (snippetTab.value === 'json') {
    return JSON.stringify({
      mcpServers: { completo: { type: 'http', url: `${origin.value}/mcp`, headers: { Authorization: `Bearer ${token}` } } }
    }, null, 2)
  }
  return `export COMPLETO_URL=${origin.value}\nexport COMPLETO_TOKEN=${token}\nexport COMPLETO_USER=${agent.value?.email ?? ''}`
})

const snippetHelp = computed(() => ({
  cli: 'Or let `completo config` save them to ~/.completo/.env on the agent\'s machine. COMPLETO_USER is what --me resolves to.',
  cc: `Run it where the agent works. Everything it does through MCP shows as ${agent.value?.name ?? 'the agent'}.`,
  json: 'For .mcp.json, or any MCP client that takes a URL and a header.'
}[snippetTab.value]))

// ─── Projects ────────────────────────────────────────────────────────────────
const { armedId: armedProject, arm: armProject, disarm: disarmProject } = useArmedDelete()
const removingProject = ref<string | null>(null)

async function removeFromProject(projectId: string, projectName: string) {
  disarmProject()
  removingProject.value = projectId
  try {
    const result = await $fetch<{ unassignedCards?: number }>(`/api/projects/${projectId}/members/${agentId}`, { method: 'DELETE' })
    await refresh()
    toast.add({
      title: `${agent.value?.name} left ${projectName}`,
      description: result.unassignedCards ? `${plural(result.unassignedCards, 'card')} unassigned.` : undefined,
      color: 'success'
    })
  } catch (e: unknown) {
    toast.add({ title: `Could not remove it from ${projectName}`, description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    removingProject.value = null
  }
}

// ─── Suspend, unsuspend, delete, transfer ────────────────────────────────────
const showSuspend = ref(false)
const showDelete = ref(false)
const showTransfer = ref(false)
const busy = ref(false)

async function suspend() {
  busy.value = true
  try {
    const result = await $fetch<{ revokedTokens: number }>(`/api/agents/${agentId}/suspend`, { method: 'POST' })
    showSuspend.value = false
    createdToken.value = null
    await refresh()
    toast.add({
      title: `${agent.value?.name} suspended`,
      description: result.revokedTokens ? `${plural(result.revokedTokens, 'token')} revoked.` : undefined,
      color: 'success'
    })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to suspend', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function unsuspend() {
  busy.value = true
  try {
    await $fetch(`/api/agents/${agentId}/unsuspend`, { method: 'POST' })
    await refresh()
    toast.add({ title: `${agent.value?.name} is active again`, description: 'Generate a token so it can work.', color: 'success' })
    nextTick(() => tokenInput.value?.focus())
  } catch (e: unknown) {
    toast.add({ title: 'Could not unsuspend', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await $fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
    showDelete.value = false
    toast.add({ title: `${agent.value?.name} deleted`, color: 'success' })
    await navigateTo('/agents')
  } catch (e: unknown) {
    toast.add({ title: 'Failed to delete', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    busy.value = false
  }
}

const deleteImpact = computed(() => {
  const a = agent.value
  if (!a) return ''
  const parts = [
    a.tokens.length ? `Revokes ${plural(a.tokens.length, 'token')}` : '',
    a.projectCount ? `removes ${a.name} from ${plural(a.projectCount, 'project')}` : ''
  ].filter(Boolean)
  const lead = parts.length ? `${parts.join(' and ')}.` : `Removes ${a.name}.`
  const cards = a.assignedCardCount ? ` Its ${plural(a.assignedCardCount, 'card')} ${a.assignedCardCount === 1 ? 'becomes' : 'become'} unassigned.` : ''
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}${cards} Its comments and uploads stay.`
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <UiPage
    width="wide"
    :title="agent?.name"
    :crumbs="[{ label: 'Agents', to: '/agents' }]"
  >
    <template v-if="agent">
      <!-- Identity -->
      <div class="flex flex-wrap sm:flex-nowrap items-start gap-4">
        <UiAvatar
          :alt="agent.name"
          kind="agent"
          :color="agent.color"
          size="xl"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <input
              v-model="nameDraft"
              type="text"
              aria-label="Agent name"
              maxlength="100"
              class="min-w-0 flex-1 max-w-md text-lg font-bold text-highlighted bg-transparent border-0 border-b border-transparent hover:not-focus-visible:border-default rounded-none tracking-heading leading-tight py-0.5 transition-colors"
              @blur="commitName"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              @keydown.esc.prevent="revert('name', $event)"
            >
            <UiAgentChip />
            <UBadge
              v-if="agent.suspended"
              color="error"
              label="Suspended"
            />
          </div>
          <input
            v-model="descriptionDraft"
            type="text"
            aria-label="Description"
            placeholder="Add a description: what it does"
            maxlength="500"
            class="mt-0.5 w-full max-w-xl text-sm text-muted placeholder:text-dimmed bg-transparent border-0 border-b border-transparent hover:not-focus-visible:border-default rounded-none py-0.5 transition-colors"
            @blur="commitDescription"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            @keydown.esc.prevent="revert('description', $event)"
          >

          <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dimmed">
            <UiManagedBy :manager="agent.managedBy" />
            <span class="flex items-center gap-1">
              Colour
              <UPopover v-model:open="colorOpen">
                <UButton
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  trailing-icon="i-lucide-chevron-down"
                  :aria-label="`Colour, ${agent.color ?? 'none'}. Change`"
                >
                  <span
                    class="swatch-dot size-2.5 rounded-full"
                    :style="{ '--swatch': agent.color ?? undefined }"
                  />
                  <span class="font-mono text-muted">{{ agent.color ?? 'none' }}</span>
                </UButton>
                <template #content>
                  <div class="p-3 w-40">
                    <ColorPicker
                      :model-value="agent.color ?? COLOR_PALETTE[0]"
                      @update:model-value="commitColor"
                    />
                  </div>
                </template>
              </UPopover>
            </span>
            <span>Created {{ formatDate(agent.createdAt) }}</span>
            <span :title="agent.lastSeenAt ? formatTimestamp(agent.lastSeenAt) : undefined">
              Last active {{ agent.lastSeenAt ? relativeTime(agent.lastSeenAt) : 'never' }}
            </span>
            <span
              class="font-mono"
              title="Generated. It never receives email."
            >{{ agent.email }}</span>
          </div>
        </div>
        <UButton
          v-if="isAdmin"
          label="Transfer to…"
          icon="i-lucide-arrow-right-left"
          color="neutral"
          variant="outline"
          class="shrink-0"
          @click="showTransfer = true"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <!-- Tokens -->
        <div class="rounded-xl border border-default bg-default shadow-raise overflow-hidden">
          <div class="px-card pt-4 pb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-key-round"
              class="text-base text-dimmed"
            />
            <span class="text-xs font-semibold uppercase tracking-label text-dimmed">API tokens</span>
            <span class="ml-auto font-mono tabular-nums text-xs text-dimmed">{{ tokens.length }}</span>
          </div>

          <div class="px-card pb-3">
            <p class="text-sm text-dimmed leading-relaxed">
              Each token acts as {{ agent.name }}, inside {{ agent.name }}'s projects and nowhere else. Generate one per machine or pipeline, so you can revoke one without stopping the others.
            </p>
          </div>

          <p
            v-if="agent.suspended"
            class="mx-card rounded-lg border border-default bg-muted px-3 py-2.5 text-sm text-muted"
          >
            Suspended, so it holds no tokens. Unsuspend it to generate one.
          </p>
          <div
            v-else
            class="mx-card rounded-lg border border-default overflow-hidden"
          >
            <div
              data-focus-field="inset"
              class="flex items-center gap-2 px-3 py-2.5 bg-default border-b border-transparent"
            >
              <input
                ref="tokenInput"
                v-model="tokenName"
                type="text"
                aria-label="Token name"
                placeholder="Token name (e.g. GitLab CI)"
                maxlength="100"
                class="flex-1 min-w-0 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0"
                @keydown.enter.prevent="createToken"
              >
              <select
                v-model="tokenExpiry"
                aria-label="Token expiry"
                class="text-sm text-muted bg-transparent border-0 cursor-pointer"
              >
                <option value="">
                  No expiry
                </option>
                <option value="30">
                  30 days
                </option>
                <option value="90">
                  90 days
                </option>
                <option value="365">
                  1 year
                </option>
              </select>
              <UButton
                label="Generate token"
                icon="i-lucide-plus"
                class="shrink-0"
                :disabled="!tokenName.trim()"
                :loading="tokenLoading"
                @click="createToken"
              />
            </div>
          </div>

          <!-- One-time reveal -->
          <div
            v-if="createdToken"
            class="mx-card mt-3 rounded-lg border border-success/30 bg-success/5 p-3"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon
                name="i-lucide-check-circle"
                class="text-base text-success shrink-0"
              />
              <span class="text-sm font-medium text-success">Token "{{ createdTokenName }}" created. Copy it now, it won't be shown again.</span>
            </div>
            <div class="flex items-center gap-2">
              <code class="flex-1 min-w-0 text-xs font-mono text-default bg-default rounded-md px-2 py-1.5 border border-accented truncate select-all">{{ createdToken }}</code>
              <UButton
                :label="tokenCopied ? 'Copied!' : 'Copy'"
                :icon="tokenCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                variant="ghost"
                color="neutral"
                size="sm"
                class="shrink-0"
                :class="tokenCopied ? 'text-success! bg-success/10' : ''"
                @click="copyToken"
              />
              <UButton
                label="Dismiss"
                variant="ghost"
                color="neutral"
                size="xs"
                class="shrink-0"
                @click="createdToken = null"
              />
            </div>

            <div class="mt-3 pt-3 border-t border-success/20">
              <div class="flex flex-wrap items-center gap-2">
                <UiSectionLabel
                  label="Use it"
                  icon="i-lucide-terminal"
                />
                <UTabs
                  v-model="snippetTab"
                  :items="SNIPPETS"
                  :content="false"
                  size="xs"
                  class="ml-auto"
                />
              </div>
              <div class="relative mt-2">
                <pre class="rounded-md border border-default bg-default px-3 py-2.5 pr-20 text-xs font-mono text-default overflow-x-auto thin-scroll">{{ snippet }}</pre>
                <UButton
                  :label="snippetCopied ? 'Copied!' : 'Copy'"
                  :icon="snippetCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  class="absolute top-1.5 right-1.5"
                  :class="snippetCopied ? 'text-success! bg-success/10' : ''"
                  :aria-label="`Copy the ${SNIPPETS.find(s => s.value === snippetTab)?.label} setup`"
                  @click="copySnippet(snippet)"
                />
              </div>
              <p class="mt-1.5 text-xs text-dimmed leading-relaxed">
                {{ snippetHelp }}
              </p>
            </div>
          </div>

          <!-- Token list -->
          <div
            v-if="tokens.length"
            class="mx-card mt-3 mb-5 rounded-lg border border-default divide-y divide-default overflow-hidden"
          >
            <div
              v-for="token in tokens"
              :key="token.id"
              class="group flex items-center px-3 py-2.5 bg-default"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-default truncate">{{ token.name }}</span>
                  <code class="text-xs font-mono text-dimmed bg-elevated rounded-md px-1.5 py-0.5 shrink-0">{{ token.tokenPrefix }}...</code>
                  <UBadge
                    v-if="token.isExpired"
                    color="error"
                    label="Expired"
                  />
                </div>
                <div class="flex flex-wrap items-center gap-x-3 mt-0.5 text-xs text-dimmed">
                  <span>Created {{ formatTokenDate(token.createdAt) }}</span>
                  <span v-if="token.expiresAt">{{ token.isExpired ? 'Expired' : 'Expires' }} {{ formatTokenDate(token.expiresAt) }}</span>
                  <span>{{ token.lastUsedAt ? `Last used ${relativeTime(token.lastUsedAt)}` : 'Not used yet' }}</span>
                </div>
              </div>
              <div class="shrink-0 ml-3">
                <UTooltip
                  v-if="deletingTokenId !== token.id"
                  text="Revoke token"
                >
                  <UButton
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :aria-label="`Revoke ${token.name}`"
                    class="hover:text-error hover:bg-error/10 opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-60"
                    @click="startDeleteToken(token.id)"
                  />
                </UTooltip>
                <UiInlineConfirm
                  v-else
                  label="this token"
                  @confirm="confirmDeleteToken(token.id)"
                  @cancel="cancelDeleteToken"
                />
              </div>
            </div>
          </div>
          <div
            v-else
            class="px-card pb-5 pt-3 flex items-center gap-2 text-sm text-dimmed"
          >
            <UIcon
              name="i-lucide-key-round"
              class="text-base"
            />
            No tokens yet. Until it has one, {{ agent.name }} can do nothing.
          </div>
        </div>

        <!-- Right column -->
        <div class="flex flex-col gap-4">
          <div class="rounded-xl border border-default bg-default shadow-raise overflow-hidden">
            <div class="px-card pt-4 pb-2 flex items-center gap-2">
              <UIcon
                name="i-lucide-folder-kanban"
                class="text-base text-dimmed"
              />
              <span class="text-xs font-semibold uppercase tracking-label text-dimmed">Projects</span>
              <span class="ml-auto font-mono tabular-nums text-xs text-dimmed">{{ agent.projectCount }}</span>
            </div>
            <div
              v-if="agent.projects.length"
              class="mx-card rounded-lg border border-default divide-y divide-default"
            >
              <div
                v-for="p in agent.projects"
                :key="p.id"
                class="group flex items-center gap-2 px-3 py-2 min-w-0"
              >
                <span class="flex items-center justify-center size-5 rounded-md bg-elevated shrink-0">
                  <UIcon
                    :name="`i-lucide-${p.icon || 'folder'}`"
                    class="text-2xs text-dimmed"
                  />
                </span>
                <NuxtLink
                  :to="`/projects/${p.slug}`"
                  class="text-sm font-medium text-default truncate hover:text-primary"
                >{{ p.name }}</NuxtLink>
                <span class="font-mono text-xs text-dimmed shrink-0">{{ p.key }}</span>
                <span class="ml-auto flex items-center gap-1 text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 bg-elevated text-muted">
                  <UIcon
                    name="i-lucide-lock"
                    class="text-2xs"
                  />
                  Member
                </span>
                <UiInlineConfirm
                  v-if="armedProject === p.id"
                  :label="`it from ${p.name}`"
                  @confirm="removeFromProject(p.id, p.name)"
                  @cancel="disarmProject"
                />
                <UTooltip
                  v-else
                  text="Remove from project"
                >
                  <UButton
                    icon="i-lucide-user-minus"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :loading="removingProject === p.id"
                    :aria-label="`Remove ${agent.name} from ${p.name}`"
                    class="hover:text-error hover:bg-error/10 opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-60"
                    @click="armProject(p.id)"
                  />
                </UTooltip>
              </div>
            </div>
            <p
              v-else
              class="mx-card rounded-lg border border-default px-3 py-2.5 text-sm text-dimmed"
            >
              In no project yet.
            </p>
            <p class="px-card pt-2.5 pb-4 text-xs text-dimmed leading-relaxed">
              Project owners add {{ agent.name }} from a project's Members list, always as Member. An agent only joins projects its manager is in; an admin's agents may join any.
            </p>
          </div>

          <div class="rounded-xl border border-default bg-muted px-4 py-3">
            <UiSectionLabel
              label="Locked for agents"
              icon="i-lucide-lock"
            />
            <p class="mt-1.5 text-xs text-muted leading-relaxed">
              Can't sign in or reset a password, be admin or a project owner, create projects or tokens, manage members, receive email, or join a project its manager isn't in.
            </p>
          </div>

          <div class="rounded-xl border border-error/30 bg-default overflow-hidden">
            <div class="px-4 py-3 flex items-start gap-3 border-b border-error/20">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-highlighted">
                  {{ agent.suspended ? 'Unsuspend' : 'Suspend' }}
                </div>
                <p class="text-xs text-muted mt-0.5 leading-relaxed">
                  <template v-if="!agent.suspended">
                    Revokes {{ agent.tokens.length ? (agent.tokens.length === 1 ? 'its token' : `all ${agent.tokens.length} tokens`) : 'any token' }} now. Running sessions fail on their next request. Cards and projects stay.
                  </template>
                  <template v-else-if="!agent.managedBy">
                    It has no manager. An admin has to transfer it before it can be woken.
                  </template>
                  <template v-else>
                    Wakes it with no tokens. Generate a new one so it can work again.
                  </template>
                </p>
              </div>
              <UButton
                v-if="!agent.suspended"
                label="Suspend"
                icon="i-lucide-shield-ban"
                size="sm"
                color="neutral"
                variant="outline"
                @click="showSuspend = true"
              />
              <UButton
                v-else
                label="Unsuspend"
                icon="i-lucide-shield-check"
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="!agent.managedBy"
                :loading="busy"
                @click="unsuspend"
              />
            </div>
            <div class="px-4 py-3 flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-highlighted">
                  Delete
                </div>
                <p class="text-xs text-muted mt-0.5 leading-relaxed">
                  Removes {{ agent.name }} and its tokens. Its cards become unassigned; its comments stay.
                </p>
              </div>
              <UButton
                label="Delete"
                icon="i-lucide-trash-2"
                size="sm"
                color="error"
                variant="soft"
                @click="showDelete = true"
              />
            </div>
          </div>
        </div>
      </div>

      <UiConfirmDialog
        v-model:open="showSuspend"
        icon="i-lucide-shield-ban"
        :title="`Suspend ${agent.name}?`"
        :description="agent.tokens.length ? `${agent.tokens.length === 1 ? 'Its token is' : `Its ${agent.tokens.length} tokens are`} revoked now.` : 'Nothing can act as it until it is woken.'"
        action-label="Suspend"
        :loading="busy"
        @confirm="suspend"
      >
        <template #body>
          <p class="text-sm text-muted leading-relaxed">
            Anything running as {{ agent.name }} fails on its next request. Cards, comments and project memberships stay. To bring it back, unsuspend it and generate a new token.
          </p>
        </template>
      </UiConfirmDialog>

      <UiConfirmDialog
        v-model:open="showDelete"
        :title="`Delete ${agent.name}?`"
        description="This cannot be undone."
        :confirm-text="agent.name"
        confirm-label="agent name"
        :loading="busy"
        @confirm="remove"
      >
        <template #body>
          <p class="text-sm text-muted leading-relaxed">
            {{ deleteImpact }}
          </p>
        </template>
      </UiConfirmDialog>

      <AgentsTransferDialog
        v-model:open="showTransfer"
        :agents="[agent]"
        @done="refresh"
      />
    </template>
  </UiPage>
</template>
