<script setup lang="ts">
/**
 * The section navigation of a long page (handoff `03-layout-navigation.md` ›
 * Inhaltsnavigation): 240px, sticky 24px from the top, one line per entry with
 * an icon that never shrinks. The active entry follows the scroll position and
 * is marked `aria-current="location"`; a click scrolls smoothly to its section
 * and *replaces* the URL hash, so Back still leaves the page rather than
 * walking back through its sections.
 *
 * Entries whose section rendered nothing are dropped — Profile's connections
 * section is empty on an install without OAuth, and an entry that scrolls
 * nowhere is a promise the page does not keep.
 */
interface TocItem {
  id: string
  label: string
  icon: string
}

const props = defineProps<{
  items: TocItem[]
}>()

const present = ref<TocItem[]>([])
const current = ref<string | null>(null)
let intersections: IntersectionObserver | undefined
let mutations: MutationObserver | undefined
let scroller: HTMLElement | null = null
/**
 * After a click the clicked entry owns `current` until the person scrolls
 * themselves. A timer is not enough: a section near the end of the page cannot
 * reach the top band, so once a timer ran out the marker fell back to whichever
 * section above it was still in view.
 */
let pinned = false
function unpin() {
  pinned = false
}

function sectionOf(id: string) {
  return document.getElementById(id)
}

function go(id: string) {
  const el = sectionOf(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // A smooth scroll passes the sections in between; without the pin each of
  // them would take the marker on the way past, and a section near the end of
  // the page — which cannot scroll to the top — would never get it at all.
  pinned = true
  current.value = id
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}

/**
 * Sections fill in after mount — Profile's activity waits for its data — so
 * which entries exist is re-read whenever the sections' content changes, not
 * once at mount.
 */
function refresh() {
  present.value = props.items.filter(i => (sectionOf(i.id)?.childElementCount ?? 0) > 0)
  if (!current.value || !present.value.some(i => i.id === current.value)) current.value = present.value[0]?.id ?? null
}

onMounted(async () => {
  await nextTick()
  const first = sectionOf(props.items[0]?.id ?? '')
  if (!first) return
  refresh()

  scroller = first.closest<HTMLElement>('.c2s-scroll')
  for (const type of ['wheel', 'touchmove', 'keydown'] as const) scroller?.addEventListener(type, unpin, { passive: true })

  const visible = new Map<string, boolean>()
  intersections = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target.id, e.isIntersecting)
    if (pinned) return
    // The first section, in page order, that is in the top band.
    const top = present.value.find(i => visible.get(i.id))
    if (top) current.value = top.id
  }, { root: scroller, rootMargin: '0px 0px -60% 0px' })
  for (const i of props.items) {
    const el = sectionOf(i.id)
    if (el) intersections.observe(el)
  }

  mutations = new MutationObserver(refresh)
  mutations.observe(first.parentElement!, { childList: true, subtree: true })

  const hash = location.hash.slice(1)
  if (hash && present.value.some(i => i.id === hash)) go(hash)
})
onBeforeUnmount(() => {
  intersections?.disconnect()
  mutations?.disconnect()
  for (const type of ['wheel', 'touchmove', 'keydown'] as const) scroller?.removeEventListener(type, unpin)
})

// The account menu links to `/profile#security` from anywhere, including from
// Profile itself, where the page does not remount.
const route = useRoute()
watch(() => route.hash, (hash) => {
  const id = hash.slice(1)
  if (id && present.value.some(i => i.id === id)) go(id)
})
</script>

<template>
  <nav
    aria-label="On this page"
    class="c2s-toc"
  >
    <ul class="flex flex-col gap-0.5">
      <li
        v-for="item in present"
        :key="item.id"
      >
        <a
          :href="`#${item.id}`"
          class="c2s-toc-link"
          :aria-current="current === item.id ? 'location' : undefined"
          @click.prevent="go(item.id)"
        >
          <UIcon
            :name="item.icon"
            class="size-4 shrink-0"
          />
          <span class="whitespace-nowrap">{{ item.label }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
