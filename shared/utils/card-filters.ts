/**
 * Whether a card matches a view's saved filters: *all types, any value*.
 *
 * Shared because two places answer it — the view filters its cards in the
 * client, and the project overview counts each view's cards on the server — and
 * the overview used to skip the filters, so every list showed the project's whole
 * open count. Two spellings of "does this card match" drift into exactly that.
 */

export interface CardFilterState {
  statusIds: string[]
  priorities: string[]
  assigneeIds: string[]
  tagIds: Set<string>
}

/** The four filterable fields. */
export type FilterField = 'status' | 'priority' | 'assignee' | 'tags'

/**
 * Enough of a card to filter. Looser than a full card because the card-create
 * form has to be tested against the filters before there is a card — see
 * `unmatchedFilters` — and the overview counts from a few columns.
 */
export interface FilterableCard {
  statusId: string
  priority: string
  assigneeId?: string | null
  tags?: { id: string }[]
}

/** One active filter: what satisfies it, and whether a given card does. */
interface ActiveFilter {
  field: FilterField
  /** Any *one* of these satisfies it. Ids, except priority, which is its own value. */
  values: string[]
  test: (card: FilterableCard) => boolean
}

/**
 * The active filters, as predicates.
 *
 * Written once and read three times — `filterCards` hides what fails,
 * `unmatchedFilters` names it, and the overview counts what passes — because a
 * card the board hides while the panel says nothing is wrong is precisely the
 * bug this exists to explain (CF-434).
 *
 * The sets are built here rather than per card: this runs once per filter pass,
 * over every card on the board.
 */
function activeFilters(f: CardFilterState): ActiveFilter[] {
  const active: ActiveFilter[] = []
  if (f.statusIds.length) {
    const set = new Set(f.statusIds)
    active.push({ field: 'status', values: f.statusIds, test: c => set.has(c.statusId) })
  }
  if (f.priorities.length) {
    const set = new Set(f.priorities)
    active.push({ field: 'priority', values: f.priorities, test: c => set.has(c.priority) })
  }
  if (f.assigneeIds.length) {
    const set = new Set(f.assigneeIds)
    // An unassigned card fails an assignee filter rather than passing it.
    active.push({ field: 'assignee', values: f.assigneeIds, test: c => !!c.assigneeId && set.has(c.assigneeId) })
  }
  if (f.tagIds.size) {
    active.push({ field: 'tags', values: [...f.tagIds], test: c => (c.tags || []).some(t => f.tagIds.has(t.id)) })
  }
  return active
}

export function hasActiveFilters(f: CardFilterState): boolean {
  return f.statusIds.length > 0
    || f.priorities.length > 0
    || f.assigneeIds.length > 0
    || f.tagIds.size > 0
}

export function filterCards<C extends FilterableCard>(cards: C[], f: CardFilterState): C[] {
  const active = activeFilters(f)
  if (!active.length) return cards
  return cards.filter(c => active.every(a => a.test(c)))
}

/**
 * Which active filters a card fails — the filters combine as *all types, any
 * value*, so this is every type that has to be satisfied before the card shows.
 *
 * Returns them rather than a boolean because the card panel lists what is
 * missing and the list shrinks as each one is met.
 */
export function unmatchedFilters(card: FilterableCard, f: CardFilterState): Array<{ field: FilterField, values: string[] }> {
  return activeFilters(f)
    .filter(a => !a.test(card))
    .map(a => ({ field: a.field, values: a.values }))
}

export function countActiveFilters(f: CardFilterState): number {
  return f.statusIds.length + f.priorities.length + f.assigneeIds.length + f.tagIds.size
}
