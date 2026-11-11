<script setup lang="ts">
import type { ManagerCandidate } from '~/types/agent'

/**
 * Hand one agent or a selection to a new manager. Admins only.
 *
 * The cost comes first. An agent can only be in projects its manager is in, so
 * moving it to someone who is not in one of them takes it out of that project,
 * and the picker says so beside every candidate ("keeps all projects", "2 leave
 * 1 project") before one is chosen, from `GET /api/agents/managers`, which
 * prices every candidate in one request. Once a candidate is chosen, the loss is
 * summed per project rather than repeated per agent.
 *
 * A suspended agent stays suspended, for its new manager to wake.
 */
const props = defineProps<{
  agents: Array<{ id: string, name: string, color?: string | null, managedBy?: { id: string, name: string } | null }>
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ done: [] }>()

const toast = useToast()
const candidates = ref<ManagerCandidate[]>([])
const loading = ref(false)
const toUserId = ref<string | undefined>()
const submitting = ref(false)
const error = ref('')

/** The manager they share, if they share one: moving them there changes nothing. */
const fromManager = computed(() => {
  const ids = new Set(props.agents.map(a => a.managedBy?.id ?? null))
  return ids.size === 1 ? props.agents[0]?.managedBy ?? null : null
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  toUserId.value = undefined
  error.value = ''
  loading.value = true
  try {
    candidates.value = await $fetch<ManagerCandidate[]>('/api/agents/managers', {
      query: { agentIds: props.agents.map(a => a.id).join(',') }
    })
  } catch (e: unknown) {
    candidates.value = []
    error.value = getErrorMessage(e, 'Failed to load who can take them')
  } finally {
    loading.value = false
  }
})

const eligible = computed(() => candidates.value.filter(c => c.id !== fromManager.value?.id))

const items = computed<Array<Array<Record<string, unknown>>>>(() => {
  const item = (c: ManagerCandidate) => ({ value: c.id, label: c.name, candidate: c })
  const admins = eligible.value.filter(c => c.isAdmin).map(item)
  const permitted = eligible.value.filter(c => !c.isAdmin).map(item)
  return [
    ...(admins.length ? [[{ type: 'label' as const, label: 'Admins' }, ...admins]] : []),
    ...(permitted.length ? [[{ type: 'label' as const, label: 'Can create agents' }, ...permitted]] : [])
  ]
})

const chosen = computed(() => candidates.value.find(c => c.id === toUserId.value) ?? null)
const loss = computed(() => lossesByProject(chosen.value?.removedFrom ?? []))

const candidateOf = (item: unknown) => (item as { candidate?: ManagerCandidate }).candidate

const title = computed(() => props.agents.length === 1
  ? `Transfer ${props.agents[0]!.name}`
  : `Transfer ${plural(props.agents.length, 'agent')}`)

async function transfer() {
  if (!toUserId.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const result = await $fetch<{ managedBy: { name: string }, removedFrom: unknown[] }>('/api/agents/transfer', {
      method: 'POST',
      body: { agentIds: props.agents.map(a => a.id), toUserId: toUserId.value }
    })
    open.value = false
    toast.add({
      title: `${plural(props.agents.length, 'agent')} now managed by ${result.managedBy.name}`,
      description: result.removedFrom.length ? `${plural(result.removedFrom.length, 'project membership')} removed.` : undefined,
      color: 'success'
    })
    emit('done')
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to transfer')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UiModal
    v-model:open="open"
    icon="i-lucide-arrow-right-left"
    tone="primary"
    :title="title"
    description="Choose who is responsible for them from now on."
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2 rounded-lg border border-default px-3 py-2">
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
          </span>
          <span class="text-xs text-muted truncate">{{ summarizeNames(agents.map(a => a.name)) }}</span>
          <span
            v-if="fromManager"
            class="ml-auto text-xs text-dimmed shrink-0"
          >from {{ fromManager.name }}</span>
        </div>

        <UFormField label="New manager">
          <USelectMenu
            v-model="toUserId"
            :items="items"
            value-key="value"
            :loading="loading"
            placeholder="Choose a person"
            :search-input="{ placeholder: 'Search people' }"
            class="w-full"
          >
            <template #item-leading="{ item }">
              <UiAvatar
                v-if="candidateOf(item)"
                :src="candidateOf(item)!.avatarUrl"
                :alt="candidateOf(item)!.name"
                size="3xs"
              />
            </template>
            <template #item-trailing="{ item }">
              <span
                v-if="candidateOf(item)"
                class="text-xs"
                :class="candidateOf(item)!.removedFrom.length ? 'text-warning' : 'text-dimmed'"
              >{{ lossLabel(candidateOf(item)!.removedFrom) }}</span>
            </template>
          </USelectMenu>
        </UFormField>

        <div
          v-if="loss.projects.length"
          class="rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2"
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
              <span class="text-muted truncate">{{ summarizeNames(p.agents.map(a => a.name)) }}</span>
            </li>
          </ul>
          <p
            v-if="agents.length > loss.agentCount"
            class="mt-1.5 text-xs text-muted"
          >
            The other {{ agents.length - loss.agentCount }} keep every project.
          </p>
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="error"
        />
      </div>
    </template>

    <template #footer>
      <UiSaveBar
        :submit-label="agents.length === 1 ? 'Transfer' : `Transfer ${agents.length}`"
        submit-icon="i-lucide-arrow-right-left"
        :loading="submitting"
        :disabled="!toUserId"
        :shortcut="false"
        @submit="transfer"
        @cancel="open = false"
      />
    </template>
  </UiModal>
</template>
