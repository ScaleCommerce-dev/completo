import { isCardSearchable } from '#shared/utils/card-search'

export interface CardHit {
  id: number
  title: string
  priority: string | null
  dueDate: string | null
  updatedAt: string
  projectId: string
  projectName: string
  projectSlug: string
  projectKey: string
  statusName: string | null
  statusColor: string | null
  /** Whether the card sits in its project's done status. */
  isDone: boolean
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  tags: Array<{ id: string, name: string, color: string }>
  /** The part of the description this query matched — see `descriptionSnippet`. */
  snippet: string | null
}

/**
 * Server-side card search behind the command palette's search box.
 *
 * The palette's own filtering is client-side fuse over items it already has,
 * which is right for the fixed lists — projects, actions — and impossible for
 * cards: there are as many as the instance has, and shipping them all to the
 * client to filter locally is the thing that does not scale. So the cards group
 * is fed from `/api/cards/search` and marked `ignoreFilter`, which tells the
 * palette these rows are already the answer and must not be filtered again.
 *
 * 200ms matches the `#` card picker in `DescriptionEditor`, which is the same
 * shape of request against the project-scoped endpoint.
 */
const DEBOUNCE_MS = 200

export function useCardSearch(term: Ref<string>) {
  const results = ref<CardHit[]>([])
  const loading = ref(false)

  let timer: ReturnType<typeof setTimeout> | undefined
  // Responses can land out of order — a two-character query is cheap and a
  // six-character one is not, so the wider result set can arrive last and
  // overwrite the narrower one. Only the newest request may write.
  let latest = 0

  watch(term, (value) => {
    if (timer) clearTimeout(timer)
    const q = value.trim()

    // The endpoint's own rule, not a copy of it. Below it there is nothing to
    // wait for, so the spinner would be a lie.
    if (!isCardSearchable(q)) {
      results.value = []
      loading.value = false
      return
    }

    loading.value = true
    timer = setTimeout(async () => {
      const seq = ++latest
      try {
        const hits = await $fetch<CardHit[]>('/api/cards/search', { params: { q } })
        if (seq === latest) results.value = hits
      } catch {
        if (seq === latest) results.value = []
      } finally {
        if (seq === latest) loading.value = false
      }
    }, DEBOUNCE_MS)
  })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return { results, loading }
}
