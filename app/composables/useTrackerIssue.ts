import type { Ref } from 'vue'
import type { RelationKind } from '#shared/utils/workflow'
import type { IssueOrdering, IssueRow } from '~/utils/issue-list'

/**
 * What the card page adds in the tracker interface, kept out of the page so the
 * standard interface runs none of it: the index of readable issues (chips in
 * prose, sub-issue assignees, j/k), the j/k walk through the project's issues
 * in the tracker's list order, and the writes that change more than the card's own
 * columns (parent, milestone, project, relations, archive).
 *
 * Call it only in the tracker interface, during setup: it provides `ISSUE_INDEX`
 * to everything the page renders.
 */
export function useTrackerIssue(opts: {
  card: Ref<TrackerIssueCard | null | undefined>
  /** The page's own save, which patches the card from the response. */
  persist: (updates: Record<string, unknown>) => Promise<void>
  /**
   * Refetches what the card embeds (a parent, milestone or relation changes
   * it). The page merges only those fields (`mergeEmbedded`), so a refetch can
   * never put back a property that a later edit changed.
   */
  refresh: () => Promise<unknown>
}) {
  const { card, persist, refresh } = opts

  // The card's own project only: the walk is that project's list, and a whole
  // workspace's issues on every issue page does not scale. Archived issues are
  // in it so their chips still resolve, but not in the walk, as they are in no
  // list. Fetched once the card is known, and again when it moves.
  const projectId = computed(() => card.value?.projectId)
  const { data: issues, refresh: refreshIssues } = useFetch<IssueRow[]>('/api/issues', {
    query: computed(() => ({ view: 'all', archived: 'include', projectId: projectId.value })),
    immediate: false,
    watch: false,
    default: () => []
  })
  watch(projectId, (id) => {
    if (id) refreshIssues()
  }, { immediate: true })

  // The issues the card points at can sit in other projects; their refs carry
  // enough to resolve a chip. The project's own rows win.
  const index = computed(() => {
    const c = card.value
    const refs = c ? [...(c.parent ? [c.parent] : []), ...c.children, ...c.relations.blocks, ...c.relations.blockedBy, ...c.relations.relates] : []
    const map = new Map<number, IssueIndexEntry>(refIndexEntries(refs).map(e => [e.id, e]))
    for (const i of issues.value) map.set(i.id, i)
    return map
  })
  provide(ISSUE_INDEX, index)

  /** The project's issues in the order its list shows them, for `n / m` and j/k. */
  const ordering = useLocalPref<IssueOrdering>('tracker:issue-ordering', 'manual')
  const siblings = computed(() => walkOrder(issues.value.filter(i => !i.archivedAt), ordering.value))
  const position = computed(() => siblings.value.findIndex(i => i.id === card.value?.id))

  // A new status or priority moves the card in the list, so the walk reloads.
  watch(() => [card.value?.statusId, card.value?.priority], (now, before) => {
    if (before?.[0] !== undefined && (now[0] !== before[0] || now[1] !== before[1])) refreshIssues()
  })

  function step(by: number) {
    // An archived issue is in no list, so it has no next or previous.
    if (position.value < 0) return
    const target = siblings.value[position.value + by]
    if (target) navigateTo(`/projects/${target.project.slug}/cards/${target.ticket}`)
  }

  /** The tracker's j / k: the next and previous issue, unless a field, a menu or a dialog has the keys. */
  function onWalkKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'j' && e.key !== 'k')) return
    // `arrowKeysAreClaimed` counts a dialog only past the first, because it was
    // written for the card panel, which is one. This page is not, so any open
    // dialog (the delete confirmation, Duplicate) owns the keys.
    if (arrowKeysAreClaimed(document) || document.querySelector('[role="dialog"],[role="alertdialog"]')) return
    step(e.key === 'j' ? 1 : -1)
  }
  onMounted(() => document.addEventListener('keydown', onWalkKey))
  onUnmounted(() => document.removeEventListener('keydown', onWalkKey))

  const toast = useToast()

  /**
   * A property that lives outside `CardProperties`. Moving to another project
   * changes the ticket id and the URL, so the page follows the card there.
   */
  async function update(updates: Record<string, unknown>) {
    await persist(updates)
    if ('projectId' in updates) {
      const moved = await $fetch<{ id: number, project: { slug: string, key: string } | null }>(`/api/cards/${card.value?.id}`)
      refreshIssues()
      if (moved.project) await navigateTo(`/projects/${moved.project.slug}/cards/${formatTicketId(moved.project.key, moved.id)}`, { replace: true })
      return
    }
    await refresh()
    if ('parentId' in updates) refreshIssues()
  }

  async function addRelation(type: RelationKind, cardId: number) {
    if (!card.value) return
    try {
      await $fetch(`/api/cards/${card.value.id}/relations`, { method: 'POST', body: { type, cardId } })
      await refresh()
    } catch (e: unknown) {
      toast.add({ title: 'Failed to add relation', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
    }
  }

  async function removeRelation(relationId: string) {
    if (!card.value) return
    try {
      await $fetch(`/api/cards/${card.value.id}/relations/${relationId}`, { method: 'DELETE' })
      await refresh()
    } catch (e: unknown) {
      toast.add({ title: 'Failed to remove relation', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
    }
  }

  async function setArchived(archived: boolean) {
    await persist({ archived })
    await refresh()
    refreshIssues()
  }

  /** A new sub-issue: the card embeds its children, and the index gains a row. */
  async function onSubIssueCreated() {
    await refresh()
    refreshIssues()
  }

  return {
    index,
    walk: computed(() => ({ position: position.value, count: siblings.value.length })),
    step,
    update,
    addRelation,
    removeRelation,
    setArchived,
    onSubIssueCreated
  }
}
