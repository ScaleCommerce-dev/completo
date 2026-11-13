<script setup lang="ts">
/**
 * One issue inside another: status glyph, id, title, linking to it. An issue in
 * a project the viewer cannot read is the id and a lock, never the title.
 *
 * The link takes the target's own project slug, which the server sends with
 * every readable ref (the page's issue index only covers its own project), so
 * a relation into another project does not open under this project's name.
 */
const props = withDefaults(defineProps<{
  issue: IssueRef
  /** The tracker's sidebar lists show the title alone; the id stays in the tooltip. */
  showId?: boolean
}>(), {
  showId: true
})

const index = inject(ISSUE_INDEX, null)
const route = useRoute()

/** `KEY-42`, or the bare number for a hidden issue, whose key the viewer may not learn. */
const label = computed(() => props.issue.ticket ?? `#${props.issue.id}`)

const href = computed(() => {
  const slug = props.issue.projectSlug ?? index?.value.get(props.issue.id)?.project.slug ?? (route.params.slug as string)
  return issueRefPath(props.issue, slug)
})
</script>

<template>
  <span
    v-if="issue.hidden"
    class="inline-flex items-center gap-1.5 min-w-0 text-muted"
    title="In a project you cannot open"
  >
    <UIcon
      name="i-lucide-lock"
      class="size-3.5 shrink-0 text-dimmed"
    />
    <span class="shrink-0">{{ label }}</span>
  </span>
  <NuxtLink
    v-else
    :to="href"
    :title="`${label} ${issue.title ?? ''}`"
    class="inline-flex items-center gap-1.5 min-w-0"
  >
    <TrackerStatusIcon
      v-if="issue.status"
      :category="issue.status.category"
      :color="issue.status.color"
    />
    <span
      v-if="showId"
      class="text-muted shrink-0"
    >{{ label }}</span>
    <span class="truncate text-highlighted">{{ issue.title }}</span>
  </NuxtLink>
</template>
