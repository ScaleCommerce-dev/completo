import type { BaseCard } from '~/types/card'
// Explicit, unlike the rest of `app/utils`: auto-import is a Nuxt build step, so
// a module that leans on it cannot be imported by a plain unit test.
import { priorityLabel } from './constants'

export interface CardFilterState {
  statusIds: string[]
  priorities: string[]
  assigneeIds: string[]
  tagIds: Set<string>
}

export function hasActiveFilters(f: CardFilterState): boolean {
  return f.statusIds.length > 0
    || f.priorities.length > 0
    || f.assigneeIds.length > 0
    || f.tagIds.size > 0
}

/** The four filterable fields. */
export type FilterField = 'status' | 'priority' | 'assignee' | 'tags'

/**
 * Enough of a card to filter. Looser than `BaseCard` because the card-create
 * form has to be tested against the filters before there is a card — see
 * `unmatchedFilters`.
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
 * Written once and read twice — `filterCards` hides what fails, and
 * `unmatchedFilters` names it — because a card the board hides while the panel
 * says nothing is wrong is precisely the bug this exists to explain (CF-434).
 * Two spellings of "does this card match" would drift into exactly that.
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

export function filterCards(cards: BaseCard[], f: CardFilterState): BaseCard[] {
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

export function buildFilterSummary(
  f: CardFilterState,
  lookup: {
    statuses: { id: string, name: string }[]
    members: { id: string, name: string }[]
    tags: { id: string, name: string }[]
  }
): string {
  const lines: string[] = []
  if (f.statusIds.length) {
    const names = f.statusIds.map(id => lookup.statuses.find(s => s.id === id)?.name).filter(Boolean)
    if (names.length) lines.push(`Status: ${names.join(', ')}`)
  }
  if (f.priorities.length) {
    lines.push(`Priority: ${f.priorities.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}`)
  }
  if (f.assigneeIds.length) {
    const names = f.assigneeIds.map(id => lookup.members.find(m => m.id === id)?.name).filter(Boolean)
    if (names.length) lines.push(`Assignee: ${names.join(', ')}`)
  }
  if (f.tagIds.size) {
    const names = [...f.tagIds].map(id => lookup.tags.find(t => t.id === id)?.name).filter(Boolean)
    if (names.length) lines.push(`Tags: ${names.join(', ')}`)
  }
  return lines.join('\n')
}

/**
 * "Website", "Website or Press", "Website, Press or Launch".
 *
 * Any one value satisfies its filter, so the list is genuinely a disjunction —
 * "and" here would read as a requirement to carry all three.
 */
function orList(names: string[]): string {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/**
 * What a card still needs, one line per unmet filter, for the panel's warning.
 *
 * Phrased as the requirement rather than the failure ("a tag of Website", not
 * "no matching tag") because the reader is about to go and set it in the
 * properties row directly above — the line is an instruction, and it disappears
 * once followed.
 *
 * A value the lookup cannot name is dropped, and a filter left with no nameable
 * values is dropped with it: a filter naming a tag that has since been deleted
 * would otherwise render "a tag of" and nothing else.
 */
export function describeUnmatchedFilters(
  unmet: Array<{ field: FilterField, values: string[] }>,
  lookup: {
    statuses: { id: string, name: string }[]
    members: { id: string, name: string }[]
    tags: { id: string, name: string }[]
  }
): string[] {
  const name = (field: FilterField, value: string) => {
    if (field === 'status') return lookup.statuses.find(s => s.id === value)?.name
    if (field === 'assignee') return lookup.members.find(m => m.id === value)?.name
    if (field === 'tags') return lookup.tags.find(t => t.id === value)?.name
    return priorityLabel(value)
  }

  const PHRASE: Record<FilterField, (names: string) => string> = {
    status: n => `a status of ${n}`,
    priority: n => `priority ${n}`,
    assignee: n => `assigned to ${n}`,
    tags: n => `a tag of ${n}`
  }

  return unmet
    .map(({ field, values }) => ({ field, names: values.map(v => name(field, v)).filter(Boolean) as string[] }))
    .filter(({ names }) => names.length > 0)
    .map(({ field, names }) => PHRASE[field](orList(names)))
}
