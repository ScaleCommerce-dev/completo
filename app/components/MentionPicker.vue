<script setup lang="ts">
/**
 * The `@` picker: search members and cards, pick one, insert a reference.
 *
 * Presentational and stateless about *where* the result goes — it emits the chosen
 * record and the host decides what to insert, because the two hosts insert different
 * things. `ProseEditor` inserts a `completoMention` node; `DescriptionEditor` splices
 * markdown into a textarea. Extracting the picker rather than the insertion is what
 * lets one search box serve both while that migration finishes (CF-526).
 *
 * It searches two kinds of thing at once on purpose: `@` is how you reach a person
 * *and* how you reach a card, because in practice people type it meaning "point at
 * something" and having two triggers to remember helped nobody.
 */
const props = defineProps<{
  members?: Array<{ id: string, name: string, email?: string }>
  projectSlug?: string
  projectKey?: string
}>()

const emit = defineEmits<{
  select: [item: { _type: 'user', id: string, name: string, email?: string } | { _type: 'card', id: number, title: string }]
  close: []
}>()

const query = ref('')
const index = ref(0)
const userResults = ref<Array<{ id: string, name: string, email?: string }>>([])
const cardResults = ref<Array<{ id: number, title: string }>>([])
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')

let searchTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Every path that *ends* a search already clears this — picking a result, closing
 * the picker, typing past the trigger. Unmount was the one that did not, and it is
 * the likeliest: the editor closes on Escape or Cancel while a search typed 300ms
 * ago is still pending, and the callback then fetches and assigns into a component
 * that is gone.
 */
onBeforeUnmount(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
})

const allResults = computed(() => [
  ...userResults.value.map(u => ({ ...u, _type: 'user' as const })),
  ...cardResults.value.map(c => ({ ...c, _type: 'card' as const }))
])

watch(query, (q) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  const trimmed = q.trim()
  const members = props.members || []

  // Nothing typed: the project's own members are the useful default, since the
  // overwhelmingly common mention is someone already on the card's project.
  if (trimmed.length === 0) {
    userResults.value = members.slice(0, 5)
    cardResults.value = []
    index.value = 0
    return
  }

  // One character filters what we already hold rather than going to the server:
  // a single letter matches most of the project and the round-trip buys nothing.
  if (trimmed.length === 1) {
    const lower = trimmed.toLowerCase()
    userResults.value = members
      .filter(m => m.name.toLowerCase().includes(lower) || m.email?.toLowerCase().includes(lower))
      .slice(0, 5)
    cardResults.value = []
    index.value = 0
    return
  }

  searchTimeout = setTimeout(async () => {
    const [users, cards] = await Promise.all([
      $fetch<Array<{ id: string, name: string, email?: string }>>('/api/users/search', { params: { q: trimmed } }).catch(() => [] as Array<{ id: string, name: string, email?: string }>),
      props.projectSlug
        ? $fetch<Array<{ id: number, title: string }>>(`/api/projects/${props.projectSlug}/cards/search`, { params: { q: trimmed } }).catch(() => [] as Array<{ id: number, title: string }>)
        : Promise.resolve([] as Array<{ id: number, title: string }>)
    ])
    userResults.value = users
    cardResults.value = cards
    index.value = 0
  }, 200)
})

function onKeydown(e: KeyboardEvent) {
  const results = allResults.value
  if (e.key === 'Escape') {
    // Esc dismisses only this popover and must not travel on to the dialog —
    // the same contract the editor's own handler keeps. `preventDefault` carries
    // it today; `stopPropagation` is the belt to that braces.
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (results.length > 0) index.value = (index.value + 1) % results.length
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (results.length > 0) index.value = (index.value - 1 + results.length) % results.length
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const selected = results[index.value]
    if (selected) emit('select', selected)
  }
}

function focus() {
  nextTick(() => searchInput.value?.focus())
}

onMounted(() => {
  userResults.value = (props.members || []).slice(0, 5)
  focus()
})

defineExpose({ focus })
</script>

<template>
  <div class="rounded-lg border border-default bg-default shadow-float overflow-hidden">
    <!-- The shell owns the edge, so focus colours it. See the focus rule in main.css:
         the input itself has no border to light up. -->
    <div class="relative border-b border-default focus-within:border-primary">
      <UIcon
        name="i-lucide-search"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dimmed"
      />
      <input
        ref="searchInput"
        v-model="query"
        aria-label="Search members or cards to mention"
        placeholder="Search members or cards..."
        class="w-full pl-8 pr-3 py-2.5 text-sm text-default placeholder:text-dimmed bg-transparent border-0"
        @keydown="onKeydown"
      >
    </div>
    <div class="max-h-[240px] overflow-y-auto">
      <div v-if="userResults.length > 0">
        <div class="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-label text-dimmed">
          Members
        </div>
        <button
          v-for="(user, i) in userResults"
          :key="'u-' + user.id"
          type="button"
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
          :class="i === index ? 'bg-primary/10 text-primary' : 'text-default hover:bg-elevated'"
          @mousedown.prevent
          @click="emit('select', { ...user, _type: 'user' })"
        >
          <UiAvatar
            :alt="user.name"
            size="2xs"
          />
          <span class="font-medium truncate">{{ user.name }}</span>
          <span class="ml-auto text-xs text-dimmed truncate">{{ user.email }}</span>
        </button>
      </div>
      <div v-if="cardResults.length > 0">
        <div class="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-label text-dimmed">
          Cards
        </div>
        <button
          v-for="(c, i) in cardResults"
          :key="'c-' + c.id"
          type="button"
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
          :class="(userResults.length + i) === index ? 'bg-primary/10 text-primary' : 'text-default hover:bg-elevated'"
          @mousedown.prevent
          @click="emit('select', { ...c, _type: 'card' })"
        >
          <span class="font-mono text-xs font-semibold text-dimmed bg-elevated px-1.5 py-0.5 rounded-md shrink-0">
            {{ projectKey }}-{{ c.id }}
          </span>
          <span class="truncate">{{ c.title }}</span>
        </button>
      </div>
      <div
        v-if="userResults.length === 0 && cardResults.length === 0 && query.trim().length >= 2"
        class="px-3 py-3 text-xs text-dimmed italic text-center"
      >
        No matches found
      </div>
    </div>
  </div>
</template>
