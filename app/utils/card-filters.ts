import type { BaseCard } from '~/types/card'

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

export function filterCards(cards: BaseCard[], f: CardFilterState): BaseCard[] {
  if (!hasActiveFilters(f)) return cards
  const statusSet = f.statusIds.length ? new Set(f.statusIds) : null
  const prioritySet = f.priorities.length ? new Set(f.priorities) : null
  const assigneeSet = f.assigneeIds.length ? new Set(f.assigneeIds) : null
  const hasTag = f.tagIds.size > 0
  return cards.filter((c) => {
    if (statusSet && !statusSet.has(c.statusId)) return false
    if (prioritySet && !prioritySet.has(c.priority)) return false
    if (assigneeSet && !(c.assigneeId && assigneeSet.has(c.assigneeId))) return false
    if (hasTag && !(c.tags || []).some(t => f.tagIds.has(t.id))) return false
    return true
  })
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
