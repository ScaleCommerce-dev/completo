<script setup lang="ts">
/**
 * Star or unstar a project — the only way a project gets into the sidebar.
 *
 * Mounted in two places: the project's card in All Projects, where you curate in
 * bulk, and the project's own header, which is where you are when you arrive at
 * an unstarred project through ⌘K, a notification or My Tasks and decide to keep
 * it. The sidebar has no star of its own: its rows are plain links, and
 * `UNavigationMenu` renders every item slot inside the link, so a button there
 * would be a button inside an `<a>`.
 *
 * Callers render it only where the viewer is a real member — an admin's
 * non-member project has nothing to star — and the API refuses it regardless.
 *
 * Filled when on: lucide has no solid star, so the icon is inlined (`mode="svg"`)
 * and `*:fill-current` paints the shape — on the path, which carries its own
 * `fill="none"`, so a fill on the svg is never inherited. CSS-mask mode draws the
 * outline as a mask and cannot be filled. Primary rather than amber: `warning`
 * means a warning here, and on is what primary already says on every toggle.
 */
// The tooltip renders no element of its own, so a host's `class` is routed to
// the button rather than left to fall through to nothing.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  projectId: string
  projectName: string
  starred: boolean
}>()

const emit = defineEmits<{
  'update:starred': [starred: boolean]
}>()

const { setStarred } = useNavigation()
const busy = ref(false)

const label = computed(() => props.starred
  ? `Unstar ${props.projectName}`
  : `Star ${props.projectName}`)

async function toggle() {
  if (busy.value) return
  busy.value = true
  const next = !props.starred
  // Optimistic: the host flips its own row now and flips it back on failure.
  emit('update:starred', next)
  const ok = await setStarred(props.projectId, next)
  if (!ok) emit('update:starred', !next)
  busy.value = false
}
</script>

<template>
  <UTooltip :text="starred ? 'Remove from sidebar' : 'Keep in sidebar'">
    <UButton
      :aria-label="label"
      :aria-pressed="starred"
      variant="ghost"
      color="neutral"
      size="sm"
      square
      v-bind="$attrs"
      :class="starred ? 'text-primary' : 'text-dimmed hover:text-toned'"
      @click.stop.prevent="toggle"
    >
      <UIcon
        name="i-lucide-star"
        mode="svg"
        class="size-4"
        :class="starred ? '*:fill-current' : ''"
      />
    </UButton>
  </UTooltip>
</template>
