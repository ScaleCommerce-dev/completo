<script setup lang="ts">
import type { BaseCard } from '~/types/card'
import type { CalendarCard, CalendarApiCard, CalendarResponse } from '~/types/calendar'
import { CALENDAR_MODES, EMPTY_FILTERS, matchesCalendar, UNASSIGNED, type CalendarFilters, type CalendarMode } from '#shared/utils/calendar-filter'
import { calendarDays, cardDay, isDayKey, localDay, periodTitle, shiftAnchor, weekStart } from '~/utils/calendar-days'

/**
 * The Calendar: cards due this week or month from every project you are a
 * member of, filtered by tag, person, project and status
 * (`server/api/calendar.get.ts`).
 *
 * It lives outside projects, beside My Tasks, because what it gathers does: a
 * team's posts come from the events, the products and the campaigns they belong
 * to. What anyone sees is their own projects' cards, which the description says
 * in so many words, so two people looking at "the same" calendar can tell why
 * it differs.
 *
 * Two ways to arrive:
 * - **`/calendar`**: the filters are in the address, so a set-up can be linked
 *   to as it is, and "Save as…" keeps it under a name.
 * - **`/calendar/:id`**: a saved calendar. Changing its filters saves them, as
 *   every other setting on an existing thing does, with no Save button.
 *
 * Live: one stream over all your projects. A changed card is tested against the
 * same rule the server used (`matchesCalendar`) and enters, moves or leaves on
 * its own; only a structural change re-reads the page.
 */
const props = defineProps<{
  /** Set on `/calendar/:id`. */
  calendarId?: string
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { calendars, create, update, remove } = useCalendars()

// ─── Filters and window ──────────────────────────────────────────────────────

const list = (value: unknown): string[] => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(String)

function filtersFromQuery(): CalendarFilters {
  const q = route.query
  const mode = (CALENDAR_MODES as readonly string[]).includes(String(q.mode)) ? q.mode as CalendarMode : 'week'
  return { mode, tags: list(q.tags), people: list(q.people), projects: list(q.projects), statuses: list(q.statuses) }
}

const saved = computed(() => props.calendarId ? calendars.value?.find(c => c.id === props.calendarId) ?? null : null)
const missing = computed(() => !!props.calendarId && !!calendars.value && !saved.value)

const filters = ref<CalendarFilters>(props.calendarId ? { ...EMPTY_FILTERS } : filtersFromQuery())

// A saved calendar's filters arrive with the list; take them once per calendar.
let loadedFor: string | null = null
watch(saved, (cal) => {
  if (cal && loadedFor !== cal.id) {
    loadedFor = cal.id
    filters.value = { ...EMPTY_FILTERS, ...cal.filters }
  }
}, { immediate: true })

const today = ref(localDay())
const anchor = computed(() => isDayKey(route.query.date) ? route.query.date : today.value)
const days = computed(() => calendarDays(filters.value.mode, anchor.value))
const range = computed(() => ({ from: days.value[0]!.key, to: days.value.at(-1)!.key }))
const title = computed(() => periodTitle(filters.value.mode, anchor.value))

function setDate(day: string) {
  router.replace({ query: { ...route.query, date: day === today.value ? undefined : day } })
}

function step(direction: -1 | 1) {
  setDate(shiftAnchor(filters.value.mode, anchor.value, direction))
}

const isCurrent = computed(() => filters.value.mode === 'week'
  ? weekStart(anchor.value) === weekStart(today.value)
  : anchor.value.slice(0, 7) === today.value.slice(0, 7))

/** The filters as query parameters: the page's address, and the link you share. */
function filterQuery(f: CalendarFilters) {
  return {
    mode: f.mode === 'week' ? undefined : f.mode,
    tags: f.tags.length ? f.tags : undefined,
    people: f.people.length ? f.people : undefined,
    projects: f.projects.length ? f.projects : undefined,
    statuses: f.statuses.length ? f.statuses : undefined
  }
}

// Ad hoc: the address follows the filters. Saved: the calendar stores them.
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(filters, (f) => {
  if (!props.calendarId) {
    router.replace({ query: { date: route.query.date, ...filterQuery(f) } })
    return
  }
  const cal = saved.value
  if (!cal || JSON.stringify(cal.filters) === JSON.stringify(f)) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void update(cal.id, { filters: f })
  }, 400)
}, { deep: true })

const modeModel = computed({
  get: () => filters.value.mode,
  set: (mode: CalendarMode) => {
    filters.value = { ...filters.value, mode }
  }
})
const MODE_ITEMS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
]

// ─── Data ────────────────────────────────────────────────────────────────────

const query = computed(() => ({
  from: range.value.from,
  to: range.value.to,
  tags: filters.value.tags,
  people: filters.value.people,
  projects: filters.value.projects,
  statuses: filters.value.statuses
}))

const { data, status, error, refresh } = useFetch<CalendarResponse>('/api/calendar', {
  query,
  deep: true,
  // A saved calendar waits for its filters, or it would show everything first.
  immediate: !props.calendarId || !!saved.value
})
if (props.calendarId) {
  watch(saved, (cal) => {
    if (cal && status.value === 'idle') void refresh()
  })
}

const projectById = computed(() => new Map((data.value?.projects ?? []).map(p => [p.id, p])))
const statusById = computed(() => new Map((data.value?.statuses ?? []).map(s => [s.id, s])))
const doneStatusIds = computed(() => new Set((data.value?.projects ?? []).flatMap(p => (p.doneStatusId ? [p.doneStatusId] : []))))

function decorate(card: CalendarApiCard): CalendarCard {
  const project = projectById.value.get(card.projectId)
  const s = statusById.value.get(card.statusId)
  return {
    ...card,
    projectName: project?.name ?? '',
    projectSlug: project?.slug ?? '',
    projectKey: project?.key ?? '',
    ticket: formatTicketId(project?.key, card.id),
    statusName: s?.name ?? '',
    statusColor: s?.color ?? null,
    isDone: doneStatusIds.value.has(card.statusId)
  }
}

const cards = computed(() => (data.value?.cards ?? []).map(decorate))
const undated = computed(() => (data.value?.undated ?? []).map(decorate))
const showUndated = ref(false)

// ─── Filter choices ──────────────────────────────────────────────────────────

const tagItems = computed(() => (data.value?.tags ?? []).map(t => ({ value: t.name, label: t.name, color: t.color })))
const peopleItems = computed(() => [
  { value: UNASSIGNED, label: 'Nobody' },
  ...(data.value?.people ?? []).map(p => ({ value: p.id, label: p.name }))
])
const projectItems = computed(() => (data.value?.projects ?? []).map(p => ({ value: p.id, label: p.name })))
const statusItems = computed(() => [...new Set((data.value?.statuses ?? []).map(s => s.name.trim()))]
  .sort((a, b) => a.localeCompare(b))
  .map(name => ({ value: name, label: name })))

function filterModel(key: 'tags' | 'people' | 'projects' | 'statuses') {
  return computed({
    get: () => filters.value[key],
    set: (value: string[]) => {
      filters.value = { ...filters.value, [key]: value }
    }
  })
}
const tagsModel = filterModel('tags')
const peopleModel = filterModel('people')
const projectsModel = filterModel('projects')
const statusesModel = filterModel('statuses')

const activeFilters = computed(() => filters.value.tags.length + filters.value.people.length + filters.value.projects.length + filters.value.statuses.length)
function clearFilters() {
  filters.value = { ...filters.value, tags: [], people: [], projects: [], statuses: [] }
}

const projectCount = computed(() => data.value?.projects.length ?? 0)
const description = computed(() => {
  if (!data.value) return 'Cards due across your projects'
  return `Cards from your ${projectCount.value} ${projectCount.value === 1 ? 'project' : 'projects'}. Everyone sees the cards of the projects they are in.`
})

// ─── Live ────────────────────────────────────────────────────────────────────

let source: EventSource | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refresh()
  }, 400)
}

function dropCard(id: number) {
  if (!data.value) return
  data.value.cards = data.value.cards.filter(c => c.id !== id)
  data.value.undated = data.value.undated.filter(c => c.id !== id)
}

/**
 * Put a changed card where it now belongs, or take it away: the same test the
 * server applies, plus the window. Only that card is touched.
 */
function applyCard(card: CalendarApiCard) {
  if (!data.value) return
  // A project this page has not heard of: membership changed, so re-read.
  if (!projectById.value.has(card.projectId)) {
    scheduleRefresh()
    return
  }
  const previous = data.value.cards.find(c => c.id === card.id) ?? data.value.undated.find(c => c.id === card.id)
  dropCard(card.id)
  const statusName = statusById.value.get(card.statusId)?.name
  if (!matchesCalendar(card, statusName, filters.value)) return
  const merged = { ...card, board: card.board ?? previous?.board ?? null }
  const day = cardDay(card.dueDate)
  if (day && day >= range.value.from && day <= range.value.to) data.value.cards.push(merged)
  else if (!day && filters.value.tags.length) data.value.undated.push(merged)
}

onMounted(() => {
  source = new EventSource('/api/events?scope=mine')
  source.addEventListener('card.upsert', (e) => {
    try {
      applyCard(JSON.parse((e as MessageEvent).data) as CalendarApiCard)
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  })
  source.addEventListener('card.delete', (e) => {
    try {
      dropCard((JSON.parse((e as MessageEvent).data) as { id: number }).id)
    } catch {
      // As above.
    }
  })
  // A status or tag renamed or recoloured: the pickers and colours change too.
  source.addEventListener('view.invalidate', scheduleRefresh)
})

// The date changes at midnight for someone who leaves the page open.
let dayTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  dayTimer = setInterval(() => {
    today.value = localDay()
  }, 60_000)
})

onBeforeUnmount(() => {
  source?.close()
  if (refreshTimer) clearTimeout(refreshTimer)
  if (saveTimer) clearTimeout(saveTimer)
  if (dayTimer) clearInterval(dayTimer)
})

// ─── Moving a card to another day ────────────────────────────────────────────

async function moveCard(cardId: number, day: string) {
  const card = data.value?.cards.find(c => c.id === cardId)
  if (!card) return
  const before = card.dueDate
  card.dueDate = `${day}T00:00:00.000Z`
  try {
    await $fetch(`/api/cards/${cardId}`, { method: 'PUT', body: { dueDate: day } })
  } catch (e) {
    card.dueDate = before
    toast.add({ title: 'Could not move the card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  }
}

// ─── The card panel ──────────────────────────────────────────────────────────

interface CardDetail extends BaseCard {
  project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null } | null
  statuses: Array<{ id: string, name: string, color: string | null }>
  members: Array<{ id: string, name: string, avatarUrl: string | null }>
  projectTags: Array<{ id: string, name: string, color: string }>
  role?: string
}

const panelOpen = ref(false)
const detail = ref<CardDetail | null>(null)

async function openCard(cardId: number) {
  try {
    detail.value = await $fetch<CardDetail>(`/api/cards/${cardId}`)
    panelOpen.value = true
  } catch (e) {
    toast.add({ title: 'Could not open the card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  }
}

async function updateCard(cardId: number, updates: Record<string, unknown>) {
  try {
    const updated = await $fetch<Partial<CardDetail>>(`/api/cards/${cardId}`, { method: 'PUT', body: updates })
    if (detail.value?.id === cardId) Object.assign(detail.value, updated)
    return updated
  } catch (e) {
    toast.add({ title: 'Failed to update card', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
    return false
  }
}

async function updateTags(cardId: number, tagIds: string[]) {
  try {
    await $fetch(`/api/cards/${cardId}/tags`, { method: 'PUT', body: { tagIds } })
    if (detail.value?.id === cardId) detail.value.tags = detail.value.projectTags.filter(t => tagIds.includes(t.id))
  } catch (e) {
    toast.add({ title: 'Failed to update tags', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  }
}

// ─── Save, rename, share, delete ─────────────────────────────────────────────

const saveOpen = ref(false)
const saveName = ref('')
const saving = ref(false)

async function saveAs() {
  const name = saveName.value.trim()
  if (!name || saving.value) return
  saving.value = true
  const cal = await create(name, filters.value)
  saving.value = false
  if (!cal) return
  saveOpen.value = false
  saveName.value = ''
  await navigateTo(`/calendar/${cal.id}`)
}

const renameOpen = ref(false)
const renameValue = ref('')
watch(renameOpen, (open) => {
  if (open) renameValue.value = saved.value?.name ?? ''
})
async function rename() {
  const name = renameValue.value.trim()
  if (!saved.value || !name) return
  if (await update(saved.value.id, { name })) renameOpen.value = false
}

const { copy } = useCopyText()
/** The address of this set-up with its filters, which anyone can open and save as their own. */
function copyLink() {
  const target = router.resolve({ path: '/calendar', query: filterQuery(filters.value) })
  void copy(`${window.location.origin}${target.fullPath}`)
  toast.add({ title: 'Link copied', description: 'Whoever opens it sees these filters on their own projects, and can save it.', color: 'success' })
}

const deleteOpen = ref(false)
const deleting = ref(false)
async function deleteCalendar() {
  if (!saved.value) return
  deleting.value = true
  const ok = await remove(saved.value.id)
  deleting.value = false
  if (ok) {
    deleteOpen.value = false
    await navigateTo('/calendar')
  }
}

const savedMenu = computed(() => [[
  { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => { renameOpen.value = true } },
  { label: 'Copy link', icon: 'i-lucide-link', onSelect: copyLink }
], [
  { label: 'Delete calendar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteOpen.value = true } }
]])

useSeoMeta({ title: () => saved.value?.name ?? 'Calendar' })
</script>

<template>
  <UiPage
    :title="saved?.name ?? 'Calendar'"
    :description="description"
    variant="surface"
    :crumbs="saved ? [{ label: 'Calendar', to: '/calendar' }] : undefined"
  >
    <template #actions>
      <template v-if="calendarId && saved">
        <UButton
          icon="i-lucide-link"
          label="Copy link"
          color="neutral"
          variant="outline"
          @click="copyLink"
        />
        <UDropdownMenu
          :items="savedMenu"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="outline"
            aria-label="Calendar options"
          />
        </UDropdownMenu>
      </template>
      <UPopover
        v-else-if="!calendarId"
        v-model:open="saveOpen"
        :content="{ align: 'end' }"
      >
        <UButton
          icon="i-lucide-bookmark-plus"
          label="Save as…"
          :disabled="!activeFilters"
        />
        <template #content>
          <form
            class="p-3 flex flex-col gap-2 w-80"
            @submit.prevent="saveAs"
          >
            <span class="text-sm font-medium text-highlighted">Save these filters as a calendar</span>
            <UInput
              v-model="saveName"
              placeholder="e.g. Redaktionskalender"
              aria-label="Calendar name"
              autofocus
            />
            <span class="text-xs text-muted">It appears in the sidebar under Calendars. Only you see it; share it with Copy link.</span>
            <UButton
              type="submit"
              label="Save"
              block
              :loading="saving"
              :disabled="!saveName.trim()"
            />
          </form>
        </template>
      </UPopover>
    </template>

    <div class="flex-1 min-h-0 overflow-y-auto thin-scroll content-gutter-x content-gutter-bottom flex flex-col gap-3">
      <UAlert
        v-if="missing"
        color="neutral"
        variant="subtle"
        icon="i-lucide-calendar-x"
        title="This calendar does not exist, or it is someone else's"
        description="Saved calendars are personal. Ask for its link to open the same filters on your own projects."
        :actions="[{ label: 'Open the calendar', to: '/calendar' }]"
      />

      <template v-else>
        <!-- Window and filters -->
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="Today"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="isCurrent"
            @click="setDate(today)"
          />
          <UFieldGroup size="sm">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="outline"
              :aria-label="filters.mode === 'week' ? 'Previous week' : 'Previous month'"
              @click="step(-1)"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="outline"
              :aria-label="filters.mode === 'week' ? 'Next week' : 'Next month'"
              @click="step(1)"
            />
          </UFieldGroup>
          <span class="text-base font-semibold text-highlighted tabular-nums">{{ title }}</span>
          <UTabs
            v-model="modeModel"
            :items="MODE_ITEMS"
            :content="false"
            size="xs"
            color="neutral"
            aria-label="Week or month"
            class="ml-2"
          />

          <div class="flex flex-wrap items-center gap-2 ml-auto">
            <USelectMenu
              v-model="tagsModel"
              :items="tagItems"
              value-key="value"
              multiple
              placeholder="Tags"
              icon="i-lucide-tag"
              size="sm"
              class="w-40"
            >
              <template #item-leading="{ item }">
                <UiStatusDot
                  :color="item.color"
                  size="sm"
                />
              </template>
            </USelectMenu>
            <USelectMenu
              v-model="peopleModel"
              :items="peopleItems"
              value-key="value"
              multiple
              placeholder="People"
              icon="i-lucide-user"
              size="sm"
              class="w-36"
            />
            <USelectMenu
              v-model="projectsModel"
              :items="projectItems"
              value-key="value"
              multiple
              placeholder="Projects"
              icon="i-lucide-folder"
              size="sm"
              class="w-36"
            />
            <USelectMenu
              v-model="statusesModel"
              :items="statusItems"
              value-key="value"
              multiple
              placeholder="Status"
              icon="i-lucide-circle-dot"
              size="sm"
              class="w-36"
            />
            <UButton
              v-if="activeFilters"
              :label="`Clear ${activeFilters}`"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="clearFilters"
            />
          </div>
        </div>

        <UiLoadError
          v-if="error"
          what="the calendar"
          :error="error"
          @retry="refresh"
        />
        <div
          v-else-if="!data"
          class="h-96 rounded-xl bg-muted animate-pulse"
        />
        <CalendarGrid
          v-else
          :mode="filters.mode"
          :days="days"
          :today="today"
          :cards="cards"
          @card-click="card => openCard(card.id)"
          @move="moveCard"
          @open-day="day => { filters = { ...filters, mode: 'week' }; setDate(day) }"
        />

        <!-- With a tag chosen, its cards still to be scheduled -->
        <div
          v-if="undated.length"
          class="rounded-xl border border-default bg-default"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-default hover:bg-elevated rounded-xl transition-colors"
            :aria-expanded="showUndated"
            @click="showUndated = !showUndated"
          >
            <UIcon
              :name="showUndated ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="text-sm text-dimmed"
            />
            No date ({{ undated.length }})
          </button>
          <ul
            v-if="showUndated"
            class="border-t border-default divide-y divide-default"
          >
            <li
              v-for="card in undated"
              :key="card.id"
            >
              <button
                type="button"
                class="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-elevated transition-colors"
                @click="openCard(card.id)"
              >
                <UiStatusDot
                  :color="card.statusColor"
                  :done="card.isDone"
                  size="sm"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-highlighted">{{ card.title }}</span>
                  <span class="block truncate text-xs text-dimmed">
                    {{ [card.projectName, card.board?.name].filter(Boolean).join(' / ') }}<template v-if="card.parent"> · ↳ {{ card.parent.title }}</template>
                  </span>
                </span>
                <span class="font-mono text-xs text-dimmed">{{ card.ticket }}</span>
              </button>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <CardModal
      v-if="detail"
      v-model:open="panelOpen"
      :card="detail"
      :statuses="detail.statuses"
      :members="detail.members"
      :tags="detail.projectTags"
      :project-key="detail.project?.key"
      :project-slug="detail.project?.slug"
      :done-status-id="detail.project?.doneStatusId"
      :can-moderate="detail.role === 'owner'"
      :on-update="updateCard"
      @update-tags="updateTags"
      @open-card="openCard"
    />

    <UiModal
      v-model:open="renameOpen"
      icon="i-lucide-pencil"
      tone="primary"
      title="Rename calendar"
    >
      <template #body>
        <form
          class="flex items-center gap-2"
          @submit.prevent="rename"
        >
          <UInput
            v-model="renameValue"
            aria-label="Calendar name"
            autofocus
            class="flex-1"
          />
          <UButton
            type="submit"
            label="Rename"
            :disabled="!renameValue.trim()"
          />
        </form>
      </template>
    </UiModal>

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this calendar?"
      :description="`Only the saved filters of ${saved?.name ?? 'this calendar'} go. No card is touched.`"
      :loading="deleting"
      @confirm="deleteCalendar"
    />
  </UiPage>
</template>
