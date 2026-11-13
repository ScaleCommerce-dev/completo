<script setup lang="ts">
import type { IssueRow } from '~/utils/issue-list'

/**
 * Every issue of every project the caller can read, as one grouped issue list:
 * Active, Backlog or All, grouped by status, the project as a badge. The tab
 * lives in the query, so a reload or a back navigation keeps it.
 *
 * The tracker interface only: `middleware/interface.global.ts` sends the
 * standard interface to the projects instead, where nothing links here.
 */
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Issues · Completo' })

const VIEWS = [
  { label: 'Active', value: 'active' },
  { label: 'Backlog', value: 'backlog' },
  { label: 'All issues', value: 'all' }
]

const route = useRoute()
const router = useRouter()
const view = computed({
  get: () => VIEWS.some(v => v.value === route.query.view) ? route.query.view as string : 'all',
  set: value => router.replace({ query: { ...route.query, view: value } })
})

const { data: issues, status, refresh } = await useFetch<IssueRow[]>('/api/issues', { query: { view }, default: () => [] })

const creating = ref(false)
</script>

<template>
  <UiPage
    title="Issues"
    variant="surface"
  >
    <template #actions>
      <UButton
        label="New issue"
        icon="i-lucide-square-pen"
        @click="creating = true"
      />
    </template>

    <template #toolbar>
      <TrackerPillTabs
        v-model="view"
        :items="VIEWS"
      />
    </template>

    <TrackerIssueList
      :issues="issues"
      :loading="status === 'pending'"
      show-project
      class="flex-1 min-h-0 overflow-y-auto thin-scroll"
    />

    <TrackerNewIssueDialog
      v-model:open="creating"
      @created="refresh()"
    />
  </UiPage>
</template>
