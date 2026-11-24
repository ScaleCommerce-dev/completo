<script setup lang="ts">
import type { BaseCard } from '~/types/card'
import type { CalendarCard, CalendarApiCard, CalendarResponse } from '~/types/calendar'
import { CALENDAR_MODES, DONE_STATUS, EMPTY_FILTERS, matchesCalendar, normalizeName, UNASSIGNED, type CalendarFilters, type CalendarMode } from '#shared/utils/calendar-filter'
import { calendarDays, cardDay, isDayKey, localDay, periodTitle, shiftAnchor } from '~/utils/calendar-days'

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
const { calendars, status: calendarsStatus, refresh: refreshCalendars, create, update, remove } = useCalendars()

// ─── Filters and window ──────────────────────────────────────────────────────

const list = (value: unknown): string[] => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(String)

function filtersFromQuery(): CalendarFilters {
  const q = route.query
  const mode = (CALENDAR_MODES as readonly string[]).includes(String(q.mode)) ? q.mode as CalendarMode : 'week'
  return { mode, tags: list(q.tags), people: list(q.people), projects: list(q.projects), statuses: list(q.statuses) }
}

const saved = computed(() => props.calendarId ? calendars.value?.find(c => c.id === props.calendarId) ?? null : null)
// Only once the list has arrived: it defaults to empty, which is not "not yours".
const missing = computed(() => !!props.calendarId && calendarsStatus.value === 'success' && !saved.value)
const listFailed = computed(() => !!props.calendarId && calendarsStatus.value === 'error')

const filters = ref<CalendarFilters>(props.calendarId ? { ...EMPTY_FILTERS } : filtersFromQuery())

// A saved calendar's filters arrive with the list; take them once per calendar.
let loadedFor: string | null = null
watch(saved, (cal) => {
  if (cal && loadedFor !== cal.id) {
    loadedFor = cal.id
    filters.value = { ...EMPTY_FILTERS, ...cal.filters }
  }
}, { immediate: true })

// Ad hoc, the address is the source: Back, Forward or the sidebar's Calendar
// link change it without remounting the page, and the filters follow.
if (!props.calendarId) {
  watch(() => route.query, () => {
    const next = filtersFromQuery()
    if (JSON.stringify(next) !== JSON.stringify(filters.value)) filters.value = next
  })
}

const today = ref(localDay())
const anchor = computed(() => isDayKey(route.query.date) ? route.query.date : today.value)
/**
 * The mode on screen. "+N more" on a busy day opens that day's week without
 * touching a saved calendar's stored mode, which only the Week / Month switch
 * changes.
 */
const modeOverride = ref<CalendarMode | null>(null)
const mode = computed(() => modeOverride.value ?? filters.value.mode)
watch(() => props.calendarId, () => {
  modeOverride.value = null
})

const days = computed(() => calendarDays(mode.value, anchor.value))
const range = computed(() => ({ from: days.value[0]!.key, to: days.value.at(-1)!.key }))
const title = computed(() => periodTitle(mode.value, anchor.value))

function setDate(day: string) {
  router.replace({ query: { ...route.query, date: day === today.value ? undefined : day } })
}

function step(direction: -1 | 1) {
  setDate(shiftAnchor(mode.value, anchor.value, direction))
}

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

// Ad hoc, the address follows the filters. A saved calendar keeps its own
// until "Save changes" (below).
watch(filters, (f) => {
  if (!props.calendarId) router.replace({ query: { date: route.query.date, ...filterQuery(f) } })
}, { deep: true })

/**
 * A saved calendar's filters change what is shown, and only "Save changes"
 * stores them; "Reset" goes back, and so does leaving the page.
 *
 * A deliberate exception to the app's commit contract, which has an existing
 * thing commit per field. They used to here, 400ms after each change, and the
 * same Filter menu then meant two things: on the plain calendar a look ("only
 * Anna's, for a moment"), on a saved one a silent, permanent rewrite of it.
 * Filters on a saved view are mostly a look, so they are treated as one, the
 * way Linear and Notion treat saved views. Week / Month is part of it, since a
 * saved calendar stores the view it opens in.
 */
const canonical = (f: CalendarFilters) => JSON.stringify({
  mode: f.mode,
  tags: [...f.tags].sort(),
  people: [...f.people].sort(),
  projects: [...f.projects].sort(),
  statuses: [...f.statuses].sort()
})
const isModified = computed(() => !!saved.value && canonical({ ...EMPTY_FILTERS, ...saved.value.filters }) !== canonical(filters.value))
const savingChanges = ref(false)
async function saveChanges() {
  if (!saved.value || savingChanges.value) return
  savingChanges.value = true
  await update(saved.value.id, { filters: filters.value })
  savingChanges.value = false
}
function resetChanges() {
  if (saved.value) filters.value = { ...EMPTY_FILTERS, ...saved.value.filters }
}

const modeModel = computed({
  get: () => mode.value,
  set: (next: CalendarMode) => {
    modeOverride.value = null
    filters.value = { ...filters.value, mode: next }
  }
})

function openDay(day: string) {
  if (props.calendarId) modeOverride.value = 'week'
  else filters.value = { ...filters.value, mode: 'week' }
  setDate(day)
}
const MODE_ITEMS: Array<{ value: CalendarMode, label: string }> = [
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

// ─── Filter choices ──────────────────────────────────────────────────────────

const tagItems = computed(() => (data.value?.tags ?? []).map(t => ({ value: t.name, label: t.name, color: t.color })))
const knownPeopleItems = computed(() => [
  { value: UNASSIGNED, label: 'Nobody' },
  ...(data.value?.people ?? []).map(p => ({ value: p.id, label: p.name }))
])
const knownProjectItems = computed(() => (data.value?.projects ?? []).map(p => ({ value: p.id, label: p.name })))
// A value from a shared link that this viewer cannot resolve (`unknownProjects`)
// still needs an entry, or the picker shows its raw id.
const peopleItems = computed(() => [
  ...knownPeopleItems.value,
  ...unknownPeople.value.map(id => ({ value: id, label: 'Someone you share no project with' }))
])
const projectItems = computed(() => [
  ...knownProjectItems.value,
  ...filteredArchivedProjects.value.map(p => ({ value: p.id, label: `${p.name} (archived)` })),
  ...unknownProjects.value.map(id => ({ value: id, label: 'A project you are not in' }))
])
// One entry per name *as the filter matches it* (case and outer spaces ignored),
// in its first spelling, as the server does for tags: deduplicated by exact
// spelling, "In Progress" and "In progress" were two entries filtering the
// same cards. Each project's done status is the one exception: whatever it is
// called, it is folded into a single "Done", which means "done in its own
// project" (`DONE_STATUS`), so "Erledigt" is not left out of it.
const statusItems = computed(() => {
  const statuses = data.value?.statuses ?? []
  const byName = new Map<string, string>()
  for (const s of statuses) {
    if (doneStatusIds.value.has(s.id)) continue
    if (!byName.has(normalizeName(s.name))) byName.set(normalizeName(s.name), s.name.trim())
  }
  const items = [...byName.values()].map(name => ({ value: name, label: name }))
  if (statuses.some(s => doneStatusIds.value.has(s.id))) items.push({ value: DONE_STATUS, label: 'Done' })
  return items.sort((a, b) => a.label.localeCompare(b.label))
})

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

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * The filters sit behind one "Filter" button with a count, so the toolbar stays
 * one line at any width: four selects beside the date controls fitted only
 * while nothing was chosen, and wrapped exactly when the calendar was in use.
 * What is chosen is not repeated as chips under the toolbar. Whoever saved a
 * calendar knows what it filters, the count says that something is filtered,
 * and one click shows what: a row of chips spent a line on every visit to
 * answer a question asked rarely.
 */
const filterOpen = ref(false)

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
  data.value.undatedIds = data.value.undatedIds.filter(x => x !== id)
}

/**
 * Put a changed card where it now belongs, or take it away: the same test the
 * server applies, plus the window. Only that card is touched, and the count of
 * matching cards without a due date follows it, by the server's rule: done
 * cards are not counted.
 */
function applyCard(card: CalendarApiCard) {
  if (!data.value) return
  // A project this page has not heard of: membership changed, so re-read.
  if (!projectById.value.has(card.projectId)) {
    scheduleRefresh()
    return
  }
  const previous = data.value.cards.find(c => c.id === card.id)
  dropCard(card.id)
  const statusName = statusById.value.get(card.statusId)?.name
  if (!matchesCalendar(card, { name: statusName, isDone: doneStatusIds.value.has(card.statusId) }, filters.value)) return
  const merged = { ...card, board: card.board ?? previous?.board ?? null }
  const day = cardDay(card.dueDate)
  if (day && day >= range.value.from && day <= range.value.to) data.value.cards.push(merged)
  else if (!day && !doneStatusIds.value.has(card.statusId)) data.value.undatedIds.push(card.id)
}

/**
 * The cards the grid cannot draw, said in one quiet line rather than listed:
 * a list was tried, and it could not schedule anything (see `calendar-cards.ts`).
 * Gone at zero, so it never says "0 more cards".
 */
const undatedCount = computed(() => data.value?.undatedIds.length ?? 0)
const undatedNote = computed(() => {
  const n = undatedCount.value
  const cards = n === 1 ? '1 more card' : `${n} more cards`
  return activeFilters.value
    ? `${cards} ${n === 1 ? 'matches' : 'match'} your filters but ${n === 1 ? 'has' : 'have'} no due date.`
    : `${cards} ${n === 1 ? 'has' : 'have'} no due date.`
})

/**
 * One quiet line under the grid for what used to be the page description and
 * the count: whose cards these are, and what the grid cannot show. Both are
 * footnotes to the calendar, read when comparing with a colleague or wondering
 * where a card went, not an introduction to it.
 */
/**
 * Filter values this viewer cannot resolve: a project they are not in, or a
 * person they share no project with. They arrive with a shared link, which
 * carries project and person ids, and on the sender's projects they meant
 * something. They are kept, not dropped: the link said "only project X", and
 * for someone outside X "nothing" is the honest answer, where dropping the
 * filter would show them every card they have. But they are said, because the
 * pickers cannot name them, so the calendar came up empty while the menu read
 * "Any" and the Filter count said 1.
 */
/**
 * Filtered projects that are the viewer's own but archived (CF-420). Not
 * unknown: the viewer is a member, and the project comes back on un-archive, so
 * they are said as archived and not offered for removal, which on a saved
 * calendar would drop the project from its filters for good.
 */
const filteredArchivedProjects = computed(() => (data.value?.archivedProjects ?? [])
  .filter(p => filters.value.projects.includes(p.id)))
const archivedNote = computed(() => {
  const n = filteredArchivedProjects.value.length
  return n ? `The filters include ${n} archived ${n === 1 ? 'project, which shows' : 'projects, which show'} nothing until un-archived.` : ''
})
const unknownProjects = computed(() => data.value
  ? filters.value.projects.filter(id => !knownProjectItems.value.some(i => i.value === id)
    && !filteredArchivedProjects.value.some(p => p.id === id))
  : [])
const unknownPeople = computed(() => data.value
  ? filters.value.people.filter(id => !knownPeopleItems.value.some(i => i.value === id))
  : [])
const unknownCount = computed(() => unknownProjects.value.length + unknownPeople.value.length)
const unknownNote = computed(() => {
  const parts = [
    unknownProjects.value.length && `${unknownProjects.value.length} ${unknownProjects.value.length === 1 ? 'project you are not a member of' : 'projects you are not a member of'}`,
    unknownPeople.value.length && `${unknownPeople.value.length} ${unknownPeople.value.length === 1 ? 'person you share no project with' : 'people you share no project with'}`
  ].filter(Boolean)
  return parts.length ? `The filters include ${parts.join(' and ')}, which ${unknownCount.value === 1 ? 'matches' : 'match'} nothing for you.` : ''
})
function removeUnknown() {
  filters.value = {
    ...filters.value,
    projects: filters.value.projects.filter(id => !unknownProjects.value.includes(id)),
    people: filters.value.people.filter(id => !unknownPeople.value.includes(id))
  }
}

const footnote = computed(() => {
  const n = projectCount.value
  const from = `From your ${n} ${n === 1 ? 'project' : 'projects'}; colleagues see their own.`
  return [from, archivedNote.value, unknownNote.value, undatedCount.value ? undatedNote.value : ''].filter(Boolean).join(' ')
})

onMounted(() => {
  source = new EventSource('/api/events?scope=mine')
  // Events sent while the connection was down are gone (the bus keeps no
  // backlog), so a reconnect re-reads the page once, as project views do.
  let reconnecting = false
  source.onerror = () => {
    reconnecting = true
  }
  source.onopen = () => {
    if (reconnecting) {
      reconnecting = false
      void refresh()
    }
  }
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

/**
 * Everything a saved calendar offers beyond looking at it, in one menu: none of
 * it is the page's primary action, and a Copy link button beside the menu made
 * the header the heaviest thing on the page. Copy link leads, being the one
 * used most.
 */
const savedMenu = computed(() => [[
  { label: 'Copy link', icon: 'i-lucide-link', onSelect: copyLink },
  { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => { renameOpen.value = true } }
], [
  { label: 'Delete calendar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteOpen.value = true } }
]])

useSeoMeta({ title: () => saved.value?.name ?? 'Calendar' })
</script>

<template>
  <UiPage
    :title="saved?.name ?? 'Calendar'"
    variant="surface"
    :crumbs="saved ? [{ label: 'Calendar', to: '/calendar' }] : undefined"
  >
    <!-- The name, then the month it is showing, muted: the name says which
         calendar this is, the month where in time, as Apple Calendar heads its
         page with the month. One line instead of a page title and a separate
         month heading in the toolbar. The tab title and the breadcrumb keep the
         name alone (`title` above), so they do not change on every step. -->
    <template #title>
      <span class="block truncate">
        {{ saved?.name ?? 'Calendar' }}
        <span
          v-if="!missing"
          class="ms-2 font-semibold text-muted"
        >{{ title }}</span>
      </span>
    </template>
    <template #actions>
      <template v-if="calendarId && saved">
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
    </template>

    <template
      v-if="!listFailed && !missing"
      #toolbar
    >
      <!-- One toolbar line of controls only, the same at any width. On the
             left, moving through time and how much of it to show; on the
             right, one Filter button: four filter selects beside the date
             controls fitted only while none was set, and wrapped exactly when
             the calendar was in use. One style for all of it, neutral outline
             at one height, where a black pill toggle, outlined arrows and
             white selects had stood side by side. In the page's toolbar slot,
             so it stays put while the calendar scrolls, as the styleguide
             asks of a toolbar (`03` › Scrollen); inside the body it scrolled
             away under a header that stayed. That height is `sm`, a
             recorded deviation from the styleguide's 44px minimum
             (`docs/connect2scale.md`): tried at 44px, the controls outweighed
             the calendar they steer. The month itself is in the page title
             (see `#title`). -->
      <div class="w-full flex flex-wrap items-center gap-x-3 gap-y-2">
        <UFieldGroup size="sm">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="outline"
            :aria-label="mode === 'week' ? 'Previous week' : 'Previous month'"
            @click="step(-1)"
          />
          <!-- Always enabled, as in Apple Calendar: greyed out on the
                 current period it read as broken, and pressing it is harmless. -->
          <UButton
            label="Today"
            color="neutral"
            variant="outline"
            @click="setDate(today)"
          />
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="outline"
            :aria-label="mode === 'week' ? 'Next week' : 'Next month'"
            @click="step(1)"
          />
        </UFieldGroup>
        <!-- The chosen one solid: a grey fill read as disabled, so the
               *other* option looked selected. `min-h-7`
             matches the arrows' group, which its icon buttons stretch to 28px;
             text alone came to 27px and sat a pixel off the line. -->
        <UFieldGroup
          size="sm"
          role="group"
          aria-label="Week or month"
        >
          <UButton
            v-for="item in MODE_ITEMS"
            :key="item.value"
            :label="item.label"
            color="neutral"
            :variant="mode === item.value ? 'solid' : 'outline'"
            :aria-pressed="mode === item.value"
            class="min-h-7"
            @click="modeModel = item.value"
          />
        </UFieldGroup>

        <div class="ml-auto flex items-center gap-2">
          <!-- A saved calendar whose filters were changed: keep them, or go back.
               Left of Filter for the same reason as Save as. "Save changes" is the
               commit, so it carries the accent, as Save does in the Save as form. -->
          <template v-if="isModified">
            <UButton
              label="Reset"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="resetChanges"
            />
            <UButton
              label="Save changes"
              size="sm"
              :loading="savingChanges"
              @click="saveChanges"
            />
          </template>
          <!-- Saving belongs to filtering, so it sits beside Filter and appears
           once there is something to save. To its left: the group is
           right-aligned, so appearing on the right pushed Filter, the button
           just used, out from under the pointer. In the page header it was the
           primary action, greyed out on every visit until a filter was set,
           which read as broken rather than as "set a filter first". As a
           side action of filtering it is an outline button, not the accent. -->
          <UPopover
            v-if="!calendarId && activeFilters"
            v-model:open="saveOpen"
            :content="FIELD_MENU_ALIGN_END"
          >
            <UButton
              icon="i-lucide-bookmark-plus"
              label="Save as…"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <template #content>
              <form
                class="p-3 flex flex-col gap-2 w-80"
                @submit.prevent="saveAs"
              >
                <span class="text-sm font-medium text-highlighted">Save these filters as a calendar</span>
                <UInput
                  v-model="saveName"
                  placeholder="e.g. Content calendar"
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
          <UPopover
            v-model:open="filterOpen"
            :content="FIELD_MENU_ALIGN_END"
          >
            <UButton
              icon="i-lucide-list-filter"
              label="Filter"
              color="neutral"
              variant="outline"
              size="sm"
            >
              <template
                v-if="activeFilters"
                #trailing
              >
                <!-- `xs`: an `sm` badge made the button 4px taller than the rest of
                     the toolbar, so setting a filter nudged the whole row down. -->
                <UBadge
                  :label="String(activeFilters)"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                />
              </template>
            </UButton>
            <template #content>
              <div class="p-3 flex flex-col gap-3 w-72">
                <UFormField label="Tags">
                  <USelectMenu
                    v-model="tagsModel"
                    :items="tagItems"
                    value-key="value"
                    multiple
                    placeholder="Any"
                    icon="i-lucide-tag"
                    class="w-full"
                  >
                    <template #item-leading="{ item }">
                      <UiStatusDot
                        :color="item.color"
                        size="sm"
                      />
                    </template>
                  </USelectMenu>
                </UFormField>
                <UFormField label="People">
                  <USelectMenu
                    v-model="peopleModel"
                    :items="peopleItems"
                    value-key="value"
                    multiple
                    placeholder="Any"
                    icon="i-lucide-user"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Projects">
                  <USelectMenu
                    v-model="projectsModel"
                    :items="projectItems"
                    value-key="value"
                    multiple
                    placeholder="Any"
                    icon="i-lucide-folder"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Status">
                  <USelectMenu
                    v-model="statusesModel"
                    :items="statusItems"
                    value-key="value"
                    multiple
                    placeholder="Any"
                    icon="i-lucide-circle-dot"
                    class="w-full"
                  />
                </UFormField>
                <!-- What the pickers above cannot show: see `unknownNote`. -->
                <div
                  v-if="unknownNote"
                  class="flex flex-col items-start gap-1 text-xs text-muted"
                >
                  <span>{{ unknownNote }}</span>
                  <UButton
                    :label="unknownCount === 1 ? 'Remove it' : 'Remove them'"
                    color="neutral"
                    variant="link"
                    size="xs"
                    class="px-0"
                    @click="removeUnknown"
                  />
                </div>
                <!-- Clearing lives with the filters it clears. -->
                <UButton
                  v-if="activeFilters"
                  label="Clear filters"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="self-start"
                  @click="clearFilters"
                />
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </template>

    <!-- `page-body-start`: the 30px under the toolbar every page keeps, inside
         the scroller as `UiPage` puts it. Without it the grid sat flush under
         the toolbar once the toolbar moved into its slot. -->
    <div class="flex-1 min-h-0 overflow-y-auto thin-scroll content-gutter-x content-gutter-bottom page-body-start flex flex-col gap-3">
      <UiLoadError
        v-if="listFailed"
        what="your saved calendars"
        @retry="refreshCalendars"
      />
      <UAlert
        v-else-if="missing"
        color="neutral"
        variant="subtle"
        icon="i-lucide-calendar-x"
        title="This calendar does not exist, or it is someone else's"
        description="Saved calendars are personal. Ask for its link to open the same filters on your own projects."
        :actions="[{ label: 'Open the calendar', to: '/calendar' }]"
      />

      <template v-else>
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
          :mode="mode"
          :days="days"
          :today="today"
          :cards="cards"
          @card-click="card => openCard(card.id)"
          @move="moveCard"
          @open-day="openDay"
        />
        <p
          v-if="data"
          class="px-1 text-xs text-dimmed"
        >
          {{ footnote }}
        </p>
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
