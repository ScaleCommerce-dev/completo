import type { CardFilterState, FilterField } from '../../shared/utils/card-filters'
// Explicit, unlike the rest of `app/utils`: auto-import is a Nuxt build step, so
// a module that leans on it cannot be imported by a plain unit test. Relative for
// the same reason: `#shared` is a Nuxt alias the unit project does not have.
import { priorityLabel } from './constants'

// The matching itself is shared with the server, which counts each view's cards
// for the project overview. What is left here only names filters for display.
export { hasActiveFilters, filterCards, unmatchedFilters, countActiveFilters } from '../../shared/utils/card-filters'
export type { CardFilterState, FilterField, FilterableCard } from '../../shared/utils/card-filters'

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
