<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { AgentSummary } from '~/types/agent'
import type { AgentStatusFilter, ManagerGroup } from '~/utils/people'

definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Agents · Completo' })

/**
 * Agents: accounts for AI tools, one page for everyone who may manage them.
 *
 * A person an admin allowed sees their own agents. An admin also gets *All*,
 * which is where an instance with a hundred agents has to stay readable, so it is
 * grouped by manager, *No manager* first, because every agent in it is waiting on
 * an admin, and each group collapses and is remembered. Searching, or filtering
 * to one manager (the link from Admin › Users), flattens the list again, and a
 * search across managers brings back a *Managed by* column so a flat row still
 * says whose it is.
 *
 * Rows are one line and selectable, for the two things that are done to many at
 * once: transfer (admins) and suspend. Deleting is deliberately not one of them;
 * an agent is deleted from its own page, after typing its name.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useUserSession()
const isAdmin = computed(() => !!user.value?.isAdmin)

const scopePref = useLocalPref<'mine' | 'all'>('agents:scope', 'all')
const groupPref = useLocalPref('agents:group-by-manager', true)
const collapsed = useLocalPref<string[]>('agents:collapsed', [])

const scope = computed({
  get: () => (isAdmin.value ? scopePref.value : 'mine'),
  set: (v: 'mine' | 'all') => { scopePref.value = v }
})

const query = ref('')
/** A user id, `none`, or nothing. Mirrored into the URL so Admin › Users can link here. */
const managerFilter = computed({
  get: () => (typeof route.query.managerId === 'string' ? route.query.managerId : null),
  set: (v: string | null) => {
    router.replace({ query: { ...route.query, managerId: v || undefined } })
  }
})
const statusFilter = ref<AgentStatusFilter | undefined>()

// The link from Admin › Users names someone else's agents, which only All shows.
watch(managerFilter, (id) => {
  if (id && isAdmin.value) scope.value = 'all'
}, { immediate: true })

const { data, refresh, status } = useFetch<AgentSummary[]>('/api/agents', {
  query: computed(() => ({ scope: scope.value }))
})
const agents = computed(() => data.value ?? [])

const filtered = computed(() => filterAgents(agents.value, {
  query: query.value,
  managerId: scope.value === 'all' ? managerFilter.value : null,
  status: statusFilter.value
}))

const grouped = computed(() => isAdmin.value && scope.value === 'all' && groupPref.value
  && !query.value.trim() && !managerFilter.value)

/** Grouped, or the whole filtered list as one headerless group. */
const rowGroups = computed<Array<Pick<ManagerGroup<AgentSummary>, 'key' | 'agents'> & Partial<ManagerGroup<AgentSummary>>>>(() =>
  grouped.value ? groupByManager(filtered.value, user.value?.id) : [{ key: 'flat', agents: filtered.value }])

/** A flat list across managers has lost the group header that said whose each row is. */
const showManagerColumn = computed(() => scope.value === 'all' && !grouped.value && !managerFilter.value)

function isCollapsed(g: { key: string }) {
  return collapsed.value.includes(g.key)
}

function toggleGroup(g: { key: string }) {
  collapsed.value = isCollapsed(g) ? collapsed.value.filter(k => k !== g.key) : [...collapsed.value, g.key]
}

// ─── Filters ────────────────────────────────────────────────────────────────
const managerItems = computed(() => {
  const managers = new Map<string, { id: string, name: string, avatarUrl: string | null }>()
  for (const a of agents.value) if (a.managedBy) managers.set(a.managedBy.id, a.managedBy)
  return [
    { value: 'none', label: 'No manager' },
    ...[...managers.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({ value: m.id, label: m.id === user.value?.id ? `${m.name} (you)` : m.name, manager: m }))
  ]
})

const activeManager = computed(() => managerItems.value.find(i => i.value === managerFilter.value) ?? null)

const STATUS_ITEMS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'no-token', label: 'No token' }
]

const managerOf = (item: unknown) => (item as { manager?: { name: string, avatarUrl: string | null } }).manager

// ─── Selection ──────────────────────────────────────────────────────────────
const selected = ref(new Set<string>())

// Rows that leave the list leave the selection, or a bulk action would reach
// agents the viewer can no longer see.
watch(filtered, (rows) => {
  const visible = new Set(rows.map(a => a.id))
  const kept = [...selected.value].filter(id => visible.has(id))
  if (kept.length !== selected.value.size) selected.value = new Set(kept)
})

const selectedAgents = computed(() => agents.value.filter(a => selected.value.has(a.id)))

function toggleRow(id: string, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}

const allState = computed<boolean | 'indeterminate'>(() => {
  if (!selected.value.size) return false
  return selected.value.size === filtered.value.length ? true : 'indeterminate'
})

function toggleAll() {
  selected.value = allState.value === true ? new Set() : new Set(filtered.value.map(a => a.id))
}

// ─── Actions ────────────────────────────────────────────────────────────────
const showCreate = ref(false)
const transferTargets = ref<AgentSummary[]>([])
const showTransfer = ref(false)
const suspendTargets = ref<AgentSummary[]>([])
const suspending = ref(false)

const confirmingSuspend = computed({
  get: () => suspendTargets.value.length > 0,
  set: (open: boolean) => {
    if (!open) suspendTargets.value = []
  }
})

const suspendTokenCount = computed(() => suspendTargets.value.reduce((n, a) => n + a.tokenCount, 0))

function openTransfer(list: AgentSummary[]) {
  transferTargets.value = list
  showTransfer.value = true
}

function openSuspend(list: AgentSummary[]) {
  suspendTargets.value = list.filter(a => !a.suspended)
  if (!suspendTargets.value.length) toast.add({ title: 'Already suspended', color: 'neutral' })
}

async function confirmSuspend() {
  const ids = suspendTargets.value.map(a => a.id)
  suspending.value = true
  try {
    const result = await $fetch<{ revokedTokens: number }>('/api/agents/suspend', { method: 'POST', body: { agentIds: ids } })
    suspendTargets.value = []
    selected.value = new Set()
    await refresh()
    toast.add({
      title: `${plural(ids.length, 'agent')} suspended`,
      description: result.revokedTokens ? `${plural(result.revokedTokens, 'token')} revoked.` : undefined,
      color: 'success'
    })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to suspend', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    suspending.value = false
  }
}

async function unsuspend(agent: AgentSummary) {
  try {
    await $fetch(`/api/agents/${agent.id}/unsuspend`, { method: 'POST' })
    await refresh()
    toast.add({ title: `${agent.name} is active again`, description: 'Generate a token so it can work.', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: `Could not unsuspend ${agent.name}`, description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  }
}

async function onTransferred() {
  selected.value = new Set()
  await refresh()
}

function rowMenu(agent: AgentSummary): DropdownMenuItem[][] {
  const first: DropdownMenuItem[] = [{ label: 'Open', icon: 'i-lucide-arrow-up-right', to: `/agents/${agent.id}` }]
  if (isAdmin.value) first.push({ label: 'Transfer to…', icon: 'i-lucide-arrow-right-left', onSelect: () => openTransfer([agent]) })
  const second: DropdownMenuItem[] = agent.suspended
    ? [{ label: 'Unsuspend', icon: 'i-lucide-shield-check', disabled: !agent.managedBy, onSelect: () => unsuspend(agent) }]
    : [{ label: 'Suspend…', icon: 'i-lucide-shield-ban', color: 'error', onSelect: () => openSuspend([agent]) }]
  return [first, second]
}

function projectNames(agent: AgentSummary) {
  return agent.projects.map(p => p.name).join(', ')
}

const columnCount = computed(() => 6 + (showManagerColumn.value ? 1 : 0))

const TH = `${TABLE_CELL_PAD} ${TABLE_HEAD_LABEL} text-dimmed whitespace-nowrap text-left`
const TD = `${TABLE_CELL_PAD} text-sm text-default align-middle`
</script>

<template>
  <UiPage
    title="Agents"
    description="AI tools that act through API tokens"
    width="wide"
  >
    <template #meta>
      <UTabs
        v-if="isAdmin"
        v-model="scope"
        :items="[{ label: 'Mine', value: 'mine' }, { label: 'All', value: 'all' }]"
        :content="false"
        size="xs"
        aria-label="Whose agents"
      />
      <span class="text-sm font-mono tabular-nums text-dimmed">{{ filtered.length }}</span>
    </template>
    <template #actions>
      <UButton
        label="Create agent"
        icon="i-lucide-plus"
        @click="showCreate = true"
      />
    </template>

    <template #toolbar>
      <!-- A selection replaces the filters: the toolbar is for whatever the next
           move is, and with rows ticked the next move is one of these. -->
      <div
        v-if="selected.size"
        class="flex items-center gap-2 w-full min-w-0"
      >
        <UCheckbox
          :model-value="allState"
          aria-label="Select all agents shown"
          @update:model-value="toggleAll"
        />
        <span class="text-sm font-semibold text-highlighted shrink-0">{{ selected.size }} selected</span>
        <UButton
          v-if="isAdmin"
          label="Transfer to…"
          icon="i-lucide-arrow-right-left"
          size="sm"
          color="neutral"
          variant="outline"
          @click="openTransfer(selectedAgents)"
        />
        <UButton
          label="Suspend…"
          icon="i-lucide-shield-ban"
          size="sm"
          color="neutral"
          variant="outline"
          @click="openSuspend(selectedAgents)"
        />
        <UButton
          label="Clear"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="selected = new Set()"
        />
        <UBadge
          v-if="activeManager"
          color="neutral"
          variant="soft"
          class="ml-auto normal-case tracking-normal"
          :label="`Manager: ${activeManager.label}`"
        />
      </div>

      <div
        v-else
        class="flex flex-wrap items-center gap-2 w-full min-w-0"
      >
        <UInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="Search agents"
          aria-label="Search agents"
          size="sm"
          class="w-full sm:w-64"
        />
        <USelectMenu
          v-if="isAdmin && scope === 'all'"
          v-model="managerFilter"
          :items="managerItems"
          value-key="value"
          placeholder="Any manager"
          icon="i-lucide-user"
          size="sm"
          :search-input="{ placeholder: 'Search managers' }"
          clear
          class="w-48"
        >
          <template #item-leading="{ item }">
            <UiAvatar
              v-if="managerOf(item)"
              :src="managerOf(item)!.avatarUrl"
              :alt="managerOf(item)!.name"
              size="3xs"
            />
            <UIcon
              v-else
              name="i-lucide-user-x"
              class="text-sm text-dimmed"
            />
          </template>
        </USelectMenu>
        <USelectMenu
          v-model="statusFilter"
          :items="STATUS_ITEMS"
          value-key="value"
          placeholder="Any status"
          icon="i-lucide-circle-dot"
          size="sm"
          :search-input="false"
          clear
          class="w-40"
        />
        <USwitch
          v-if="isAdmin && scope === 'all'"
          v-model="groupPref"
          label="Group by manager"
          size="sm"
          class="sm:ml-auto"
          :disabled="!!query.trim() || !!managerFilter"
        />
      </div>
    </template>

    <UEmpty
      v-if="status !== 'pending' && !agents.length"
      class="py-16"
      icon="i-lucide-bot"
      :title="scope === 'all' ? 'No agents yet' : 'You have no agents yet'"
      description="An agent is an account for an AI tool: its own name, its own tokens, and only the projects it is added to. Its work shows as its own."
      :actions="[{ label: 'Create agent', icon: 'i-lucide-plus', onClick: () => { showCreate = true } }]"
    />

    <div
      v-else-if="agents.length"
      class="rounded-xl border border-default overflow-x-auto"
    >
      <table class="w-full min-w-[720px] table-fixed">
        <colgroup>
          <col class="w-11">
          <col>
          <col
            v-if="showManagerColumn"
            class="w-44"
          >
          <col class="w-44">
          <col class="w-18">
          <col class="w-25">
          <col class="w-28">
          <col class="w-12">
        </colgroup>
        <thead class="bg-muted">
          <tr>
            <th :class="TH">
              <UCheckbox
                :model-value="allState"
                aria-label="Select all agents shown"
                @update:model-value="toggleAll"
              />
            </th>
            <th :class="TH">
              Agent
            </th>
            <th
              v-if="showManagerColumn"
              :class="TH"
            >
              Managed by
            </th>
            <th :class="TH">
              Projects
            </th>
            <th :class="TH">
              Tokens
            </th>
            <th :class="TH">
              Last active
            </th>
            <th :class="TH">
              Status
            </th>
            <th :class="TH">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="!filtered.length">
            <td
              :colspan="columnCount + 1"
              class="px-3 py-8 text-center text-sm text-dimmed border-t border-default"
            >
              No agent matches these filters.
            </td>
          </tr>

          <template
            v-for="g in rowGroups"
            :key="g.key"
          >
            <tr
              v-if="grouped"
              class="border-t border-default bg-muted"
            >
              <td
                :colspan="columnCount + 1"
                class="px-3 py-1.5"
              >
                <button
                  type="button"
                  class="flex items-center gap-2 min-w-0 text-left"
                  :aria-expanded="!isCollapsed(g)"
                  @click="toggleGroup(g)"
                >
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="text-sm text-dimmed shrink-0 transition-transform duration-150"
                    :class="isCollapsed(g) ? '-rotate-90' : ''"
                  />
                  <UiAvatar
                    v-if="g.manager"
                    :src="g.manager.avatarUrl"
                    :alt="g.manager.name"
                    size="3xs"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-user-x"
                    class="text-sm text-dimmed shrink-0"
                  />
                  <span class="text-sm font-bold text-default truncate">{{ g.manager?.name ?? 'No manager' }}</span>
                  <span
                    v-if="g.isYou"
                    class="text-xs text-dimmed shrink-0"
                  >(you)</span>
                  <span class="font-mono tabular-nums text-xs text-dimmed shrink-0">{{ g.agents.length }}</span>
                  <span
                    v-if="!g.manager"
                    class="text-xs text-warning shrink-0"
                  >needs a transfer</span>
                  <span
                    v-if="g.suspended && g.manager"
                    class="text-xs text-error shrink-0"
                  >{{ g.suspended }} suspended</span>
                  <span
                    v-if="g.withoutToken"
                    class="text-xs text-warning shrink-0"
                  >{{ g.withoutToken }} without a token</span>
                </button>
              </td>
            </tr>

            <template v-if="!grouped || !isCollapsed(g)">
              <tr
                v-for="agent in g.agents"
                :key="agent.id"
                class="border-t border-default transition-colors cursor-pointer"
                :class="selected.has(agent.id)
                  ? 'bg-primary/5'
                  : agent.suspended ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-muted/60'"
                @click="navigateTo(`/agents/${agent.id}`)"
              >
                <td
                  :class="TD"
                  @click.stop
                >
                  <UCheckbox
                    :model-value="selected.has(agent.id)"
                    :aria-label="`Select ${agent.name}`"
                    @update:model-value="(v: boolean | 'indeterminate') => toggleRow(agent.id, v === true)"
                  />
                </td>
                <td :class="TD">
                  <div
                    class="flex items-center gap-2.5 min-w-0"
                    :class="grouped ? 'pl-6' : ''"
                  >
                    <UiAvatar
                      :alt="agent.name"
                      kind="agent"
                      :color="agent.color"
                      size="2xs"
                      class="shrink-0"
                    />
                    <NuxtLink
                      :to="`/agents/${agent.id}`"
                      class="text-sm font-semibold text-default truncate hover:text-primary"
                      @click.stop
                    >
                      {{ agent.name }}
                    </NuxtLink>
                    <span class="text-xs text-dimmed truncate">{{ agent.description }}</span>
                  </div>
                </td>
                <td
                  v-if="showManagerColumn"
                  :class="TD"
                >
                  <UiPerson
                    :person="agent.managedBy"
                    empty-label="No manager"
                  />
                </td>
                <td :class="TD">
                  <span
                    class="block truncate text-sm text-muted"
                    :title="projectNames(agent)"
                  >{{ projectNames(agent) || 'None' }}</span>
                </td>
                <td :class="TD">
                  <span class="font-mono tabular-nums text-xs text-muted">{{ agent.tokenCount }}</span>
                </td>
                <td :class="TD">
                  <span
                    class="font-mono tabular-nums text-xs text-dimmed"
                    :title="agent.lastSeenAt ? formatTimestamp(agent.lastSeenAt) : undefined"
                  >{{ agent.lastSeenAt ? relativeTime(agent.lastSeenAt) : 'Never' }}</span>
                </td>
                <td :class="TD">
                  <UBadge
                    v-if="agent.suspended"
                    color="error"
                    label="Suspended"
                  />
                  <UBadge
                    v-else-if="!agent.tokenCount"
                    color="warning"
                    label="No token"
                  />
                </td>
                <td
                  :class="TD"
                  @click.stop
                >
                  <UDropdownMenu
                    :items="rowMenu(agent)"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      icon="i-lucide-ellipsis"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Actions for ${agent.name}`"
                    />
                  </UDropdownMenu>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>

    <AgentsCreateDialog v-model:open="showCreate" />

    <AgentsTransferDialog
      v-model:open="showTransfer"
      :agents="transferTargets"
      @done="onTransferred"
    />

    <UiConfirmDialog
      v-model:open="confirmingSuspend"
      icon="i-lucide-shield-ban"
      :title="suspendTargets.length === 1 ? `Suspend ${suspendTargets[0]!.name}?` : `Suspend ${plural(suspendTargets.length, 'agent')}?`"
      :description="suspendTokenCount ? `${suspendTargets.length === 1 ? 'Its' : 'Their'} ${plural(suspendTokenCount, 'token')} ${suspendTokenCount === 1 ? 'is' : 'are'} revoked now.` : 'Nothing can act as them until they are woken.'"
      action-label="Suspend"
      :loading="suspending"
      @confirm="confirmSuspend"
    >
      <template #body>
        <p class="text-sm text-muted leading-relaxed">
          Anything running as {{ suspendTargets.length === 1 ? suspendTargets[0]!.name : 'them' }} fails on its next request. Cards, comments and project memberships stay. To bring {{ suspendTargets.length === 1 ? 'it' : 'one' }} back, unsuspend it and generate a new token.
        </p>
      </template>
    </UiConfirmDialog>
  </UiPage>
</template>
