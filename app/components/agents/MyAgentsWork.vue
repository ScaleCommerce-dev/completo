<script setup lang="ts">
import type { MyTasksCard } from '~/composables/useMyTasks'
import type { Member } from '~/types/card'

/**
 * "My agents' work" on My Tasks: the cards held by the agents you manage.
 *
 * One flat list with an Agent column, not a group per agent: at twenty-odd
 * agents mostly holding a card or two, a group each would be a wall of headers.
 * Only agents holding cards appear, open work leads (`sortAgentWork`), and the
 * first ten rows show. A suspended agent still holding a card is marked in its
 * cell, because that card is now waiting on nobody.
 *
 * Read-only rows that open the card: these are someone else's cards in the sense
 * that matters here: your agents work them, you follow them.
 */
type AgentCard = Omit<MyTasksCard, 'assignee'> & {
  assignee: Member | null
  status: { id: string, name: string, color: string | null } | null
  project: { id: string, name: string, slug: string, key: string, icon: string | null, doneStatusId: string | null }
}

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{ toggle: [], hide: [] }>()

const { data } = useFetch<{ agentCount: number, agentsWithCards: number, cards: AgentCard[] }>('/api/my-tasks/agents')

const ROWS_SHOWN = 10
const showAll = ref(false)

const cards = computed(() => sortAgentWork(data.value?.cards ?? []))
const visible = computed(() => (showAll.value ? cards.value : cards.value.slice(0, ROWS_SHOWN)))

const managesAgents = computed(() => (data.value?.agentCount ?? 0) > 0)
defineExpose({ managesAgents })

function cardUrl(card: AgentCard) {
  return `/projects/${card.project.slug}/cards/${formatTicketId(card.project.key, card.id)}`
}

const isDone = (card: AgentCard) => !!card.project.doneStatusId && card.statusId === card.project.doneStatusId

const TH = `${TABLE_CELL_PAD} ${TABLE_HEAD_LABEL} text-dimmed whitespace-nowrap text-left`
const TD = `${TABLE_CELL_PAD} align-middle`
</script>

<template>
  <section
    v-if="managesAgents"
    class="flex flex-col gap-2"
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 min-w-0 text-left"
        :aria-expanded="!props.collapsed"
        @click="emit('toggle')"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="text-sm text-dimmed transition-transform duration-150"
          :class="{ 'rotate-90': !props.collapsed }"
        />
        <UiSectionLabel
          label="My agents' work"
          icon="i-lucide-bot"
        />
      </button>
      <span class="text-xs text-dimmed shrink-0">
        <span class="font-mono tabular-nums">{{ cards.length }}</span> {{ cards.length === 1 ? 'card' : 'cards' }}
        · <span class="font-mono tabular-nums">{{ data?.agentsWithCards ?? 0 }}</span> of {{ plural(data?.agentCount ?? 0, 'agent') }}
      </span>
      <div class="flex-1 border-t border-default" />
      <UButton
        label="Hide"
        icon="i-lucide-eye-off"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="emit('hide')"
      />
    </div>

    <template v-if="!props.collapsed">
      <p
        v-if="!cards.length"
        class="rounded-xl border border-default px-4 py-3 text-sm text-dimmed"
      >
        None of your agents holds a card right now. Assign one to hand it work.
      </p>
      <div
        v-else
        class="rounded-xl border border-default overflow-x-auto"
      >
        <table class="w-full min-w-[720px] table-fixed text-left">
          <colgroup>
            <col class="w-11">
            <col class="w-22">
            <col>
            <col class="w-48">
            <col class="w-36">
            <col class="w-28">
            <col class="w-24">
          </colgroup>
          <thead class="bg-muted">
            <tr>
              <th :class="TH">
                <span class="sr-only">Done</span>
              </th>
              <th :class="TH">
                ID
              </th>
              <th :class="TH">
                Title
              </th>
              <th :class="TH">
                Agent
              </th>
              <th :class="TH">
                Status
              </th>
              <th :class="TH">
                Priority
              </th>
              <th :class="TH">
                Due
              </th>
            </tr>
          </thead>
          <tbody class="text-base">
            <tr
              v-for="card in visible"
              :key="card.id"
              class="border-t border-default hover:bg-muted/60 transition-colors cursor-pointer"
              @click="navigateTo(cardUrl(card))"
            >
              <td
                :class="TD"
                class="relative text-center"
              >
                <!-- The list view's priority edge, at the list view's geometry:
                     only high and urgent carry one. -->
                <span
                  v-if="priorityBarClass(card.priority)"
                  class="absolute left-0 top-1 bottom-1 w-accent-bar"
                  :class="priorityBarClass(card.priority)"
                />
                <UIcon
                  :name="isDone(card) ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  class="text-sm"
                  :class="isDone(card) ? 'text-success' : 'text-dimmed'"
                />
              </td>
              <td :class="TD">
                <span class="card-id text-xs text-muted">{{ formatTicketId(card.project.key, card.id) }}</span>
              </td>
              <td :class="TD">
                <NuxtLink
                  :to="cardUrl(card)"
                  class="block truncate font-medium text-highlighted hover:text-primary"
                  :title="card.title"
                  @click.stop
                >
                  {{ card.title }}
                </NuxtLink>
              </td>
              <td :class="TD">
                <span class="flex items-center gap-1.5 min-w-0">
                  <UiPerson
                    :person="card.assignee"
                    :chip="false"
                  />
                  <UBadge
                    v-if="card.assignee?.suspended"
                    color="error"
                    label="Suspended"
                  />
                </span>
              </td>
              <td :class="TD">
                <span class="inline-flex items-center gap-1.5 text-sm min-w-0">
                  <UiStatusDot
                    :color="card.status?.color"
                    :done="isDone(card)"
                    size="sm"
                  />
                  <span class="truncate">{{ card.status?.name }}</span>
                </span>
              </td>
              <td :class="TD">
                <span
                  class="inline-flex items-center gap-1 text-sm"
                  :class="priorityTextClass(card.priority)"
                >
                  <UIcon
                    :name="priorityIcon(card.priority)"
                    class="text-sm"
                  />
                  {{ priorityLabel(card.priority) }}
                </span>
              </td>
              <td :class="TD">
                <span
                  v-if="card.dueDate"
                  class="text-sm"
                  :class="dueDateTextClass(getDueDateStatus(card.dueDate))"
                >{{ formatDueDate(card.dueDate) }}</span>
              </td>
            </tr>
            <tr v-if="cards.length > visible.length">
              <td
                colspan="7"
                class="border-t border-default p-0"
              >
                <button
                  type="button"
                  class="w-full px-3 py-2 text-left text-xs font-medium text-dimmed hover:text-toned transition-colors"
                  @click="showAll = true"
                >
                  Show {{ cards.length - visible.length }} more
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
