<script setup lang="ts">
import type { AgentSummary, HandOverAction, ManagerCandidate } from '~/types/agent'

/**
 * Before a person stops being able to manage agents (deleted, suspended, demoted
 * without the permission, or the permission revoked), the agents they manage need
 * a new manager or a stop. The server refuses those changes with a 409 until one
 * of the two has happened; this is that choice, followed by the change itself.
 *
 * One choice for all of them, not one per agent. At thirty agents a per-agent
 * form is a wall nobody reads; what matters is the count, a stack of faces that
 * opens to the full list, and what the choice costs, summed per project.
 *
 * - **Transfer all to** someone who can manage agents. The picker prices every
 *   candidate before one is chosen (`GET /api/agents/managers`), and the chosen
 *   one's loss is summed per project: an agent can only be in projects its manager
 *   is in.
 * - **Suspend all**, which revokes their tokens. They then show *No manager* on
 *   the Agents page until an admin transfers them.
 *
 * No delete here: agents are deleted one by one, from their own page, after
 * typing the name.
 */
const props = defineProps<{
  person: { id: string, name: string, email: string, avatarUrl: string | null, isAdmin: boolean } | null
  action: HandOverAction
  /** The change that was refused, retried once the agents are dealt with. */
  proceed: () => Promise<void>
}>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const agents = ref<AgentSummary[]>([])
const candidates = ref<ManagerCandidate[]>([])
const loading = ref(false)
const choice = ref<'transfer' | 'suspend'>('transfer')
const toUserId = ref<string | undefined>()
const showAll = ref(false)
const submitting = ref(false)
const error = ref('')

watch(open, async (isOpen) => {
  if (!isOpen || !props.person) return
  choice.value = 'transfer'
  toUserId.value = undefined
  showAll.value = false
  error.value = ''
  loading.value = true
  try {
    agents.value = await $fetch<AgentSummary[]>('/api/agents', { query: { scope: 'all', managerId: props.person.id } })
    candidates.value = agents.value.length
      ? await $fetch<ManagerCandidate[]>('/api/agents/managers', { query: { agentIds: agents.value.map(a => a.id).join(',') } })
      : []
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to load their agents')
  } finally {
    loading.value = false
  }
})

/** Never the person themselves: they are the reason for the hand-over. */
const eligible = computed(() => candidates.value.filter(c => c.id !== props.person?.id))

const items = computed<Array<Array<Record<string, unknown>>>>(() => {
  const item = (c: ManagerCandidate) => ({ value: c.id, label: c.name, candidate: c })
  const admins = eligible.value.filter(c => c.isAdmin).map(item)
  const permitted = eligible.value.filter(c => !c.isAdmin).map(item)
  return [
    ...(admins.length ? [[{ type: 'label', label: 'Admins' }, ...admins]] : []),
    ...(permitted.length ? [[{ type: 'label', label: 'Can create agents' }, ...permitted]] : [])
  ]
})

const candidateOf = (item: unknown) => (item as { candidate?: ManagerCandidate }).candidate

const chosen = computed(() => candidates.value.find(c => c.id === toUserId.value) ?? null)
const loss = computed(() => lossesByProject(chosen.value?.removedFrom ?? []))

const tokenCount = computed(() => agents.value.reduce((n, a) => n + a.tokenCount, 0))
const projectCount = computed(() => new Set(agents.value.flatMap(a => a.projects.map(p => p.id))).size)
const suspendedCount = computed(() => agents.value.filter(a => a.suspended).length)

const firstName = computed(() => props.person?.name.split(' ')[0] ?? 'They')

const COPY: Record<HandOverAction, { title: string, icon: string, verb: string, tone: 'error' | 'warning' }> = {
  delete: { title: 'Delete user', icon: 'i-lucide-triangle-alert', verb: 'delete user', tone: 'error' },
  suspend: { title: 'Suspend user', icon: 'i-lucide-shield-ban', verb: 'suspend user', tone: 'error' },
  demote: { title: 'Demote to user', icon: 'i-lucide-user', verb: 'demote', tone: 'warning' },
  revoke: { title: 'Stop them creating agents', icon: 'i-lucide-bot', verb: 'revoke', tone: 'warning' }
}

const copy = computed(() => COPY[props.action])

const description = computed(() => {
  if (props.action === 'delete') return 'This cannot be undone.'
  if (props.action === 'suspend') return 'They can no longer sign in, and can no longer manage agents.'
  if (props.action === 'demote') return 'Without admin, and without permission to create agents, they can no longer manage any.'
  return 'Without the permission they can no longer manage agents.'
})

const submitLabel = computed(() => {
  const first = choice.value === 'transfer' ? 'Transfer' : 'Suspend'
  return `${first} and ${copy.value.verb}`
})

const canSubmit = computed(() => !loading.value && (choice.value === 'suspend' || !!toUserId.value))

async function submit() {
  if (!props.person || !canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    if (agents.value.length) {
      await $fetch(`/api/admin/users/${props.person.id}/hand-over`, {
        method: 'POST',
        body: choice.value === 'transfer' ? { action: 'transfer', toUserId: toUserId.value } : { action: 'suspend' }
      })
      toast.add({
        title: choice.value === 'transfer'
          ? `${plural(agents.value.length, 'agent')} handed to ${chosen.value?.name}`
          : `${plural(agents.value.length, 'agent')} suspended`,
        color: 'success'
      })
    }
    await props.proceed()
    open.value = false
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to hand over their agents')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :icon="copy.icon"
    :tone="copy.tone"
    :title="copy.title"
    :description="description"
  >
    <template #body>
      <div
        v-if="person"
        class="rounded-lg border border-default bg-muted p-3 mb-3"
      >
        <span class="inline-flex items-center gap-1.5">
          <UiPerson
            :person="person"
            size="sm"
            strong
          />
          <UBadge
            v-if="person.isAdmin"
            color="primary"
            label="Admin"
            class="ml-1"
          />
        </span>
        <p class="text-sm font-mono text-muted truncate mt-1">
          {{ person.email }}
        </p>
      </div>

      <p
        v-if="action === 'delete'"
        class="text-sm text-muted leading-relaxed"
      >
        Removes the account and every project membership it has. Cards assigned to
        them are left unassigned rather than deleted.
      </p>

      <div class="mt-5">
        <span class="text-xs font-semibold uppercase tracking-label text-dimmed">
          {{ loading ? 'Their agents' : `${firstName} manages ${plural(agents.length, 'agent')}` }}
        </span>

        <div class="mt-2 rounded-lg border border-default px-3 py-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex -space-x-1 shrink-0">
              <UiAvatar
                v-for="a in agents.slice(0, 5)"
                :key="a.id"
                :alt="a.name"
                kind="agent"
                :color="a.color"
                size="2xs"
                class="ring-2 ring-bg"
              />
              <span
                v-if="agents.length > 5"
                class="flex items-center justify-center size-5 rounded-md bg-elevated text-2xs font-mono text-muted ring-2 ring-bg"
              >+{{ agents.length - 5 }}</span>
            </span>
            <span class="text-xs text-muted truncate">
              <span class="font-mono tabular-nums">{{ tokenCount }}</span> {{ tokenCount === 1 ? 'token' : 'tokens' }}
              · <span class="font-mono tabular-nums">{{ projectCount }}</span> {{ projectCount === 1 ? 'project' : 'projects' }}
              <template v-if="suspendedCount">· <span class="font-mono tabular-nums">{{ suspendedCount }}</span> suspended</template>
            </span>
            <UButton
              v-if="agents.length"
              :label="showAll ? 'Hide' : 'Show all'"
              :trailing-icon="showAll ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              variant="ghost"
              color="neutral"
              size="xs"
              class="ml-auto shrink-0"
              @click="showAll = !showAll"
            />
          </div>
          <ul
            v-if="showAll"
            class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1"
          >
            <li
              v-for="a in agents"
              :key="a.id"
              class="min-w-0"
            >
              <UiPerson
                :person="a"
                :chip="false"
              />
            </li>
          </ul>
        </div>

        <URadioGroup
          v-model="choice"
          :items="[
            { value: 'transfer', label: `Transfer all ${agents.length}`, description: 'To an admin, or someone allowed to create agents.' },
            { value: 'suspend', label: `Suspend all ${agents.length}`, description: `Revokes ${plural(tokenCount, 'token')} now. They show No manager until an admin transfers them.` }
          ]"
          variant="card"
          class="mt-3"
          :ui="{ fieldset: 'gap-2', label: 'font-semibold text-highlighted' }"
        />

        <!-- Below the choice rather than inside its card: the card is a label, and
             a menu inside a label is a second click target fighting the first. -->
        <div
          v-if="choice === 'transfer'"
          class="mt-3"
        >
          <UFormField label="New manager">
            <USelectMenu
              v-model="toUserId"
              :items="items"
              value-key="value"
              placeholder="Choose a person"
              :search-input="{ placeholder: 'Search people' }"
              class="w-full"
            >
              <template #item-leading="{ item: option }">
                <UiAvatar
                  v-if="candidateOf(option)"
                  :src="candidateOf(option)!.avatarUrl"
                  :alt="candidateOf(option)!.name"
                  size="3xs"
                />
              </template>
              <template #item-trailing="{ item: option }">
                <span
                  v-if="candidateOf(option)"
                  class="text-xs"
                  :class="candidateOf(option)!.removedFrom.length ? 'text-warning' : 'text-dimmed'"
                >{{ lossLabel(candidateOf(option)!.removedFrom) }}</span>
              </template>
            </USelectMenu>
          </UFormField>

          <div
            v-if="loss.projects.length"
            class="mt-2.5 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2"
          >
            <p class="text-xs font-semibold text-highlighted">
              {{ plural(loss.agentCount, 'agent') }} {{ loss.agentCount === 1 ? 'leaves' : 'leave' }} {{ plural(loss.projects.length, 'project') }} {{ chosen?.name }} isn't in
            </p>
            <ul class="mt-1.5 flex flex-col gap-1 text-xs">
              <li
                v-for="p in loss.projects"
                :key="p.id"
                class="flex items-baseline gap-2 min-w-0"
              >
                <span class="font-medium text-default shrink-0">{{ p.name }}</span>
                <span class="text-muted shrink-0"><span class="font-mono tabular-nums">{{ p.agents.length }}</span> {{ p.agents.length === 1 ? 'agent' : 'agents' }}</span>
                <span class="text-dimmed truncate">{{ summarizeNames(p.agents.map(a => a.name)) }}</span>
              </li>
            </ul>
            <p
              v-if="agents.length > loss.agentCount"
              class="mt-1.5 text-xs text-muted"
            >
              The other {{ agents.length - loss.agentCount }} keep every project.
            </p>
          </div>
        </div>
      </div>

      <UAlert
        v-if="error"
        class="mt-3"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :description="error"
      />
    </template>

    <template #footer>
      <UiSaveBar
        :submit-label="submitLabel"
        :submit-tone="action === 'delete' || action === 'suspend' ? 'error' : 'primary'"
        :submit-icon="choice === 'transfer' ? 'i-lucide-arrow-right-left' : 'i-lucide-shield-ban'"
        :loading="submitting"
        :disabled="!canSubmit"
        :shortcut="false"
        @submit="submit"
        @cancel="open = false"
      />
    </template>
  </UiModal>
</template>
