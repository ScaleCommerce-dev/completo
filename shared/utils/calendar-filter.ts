/**
 * What the Calendar page shows, and the one test of whether a card belongs.
 *
 * Shared by the server, which answers the page's request with it, and the page,
 * which runs the same test on every live update to decide whether a changed card
 * enters, stays or leaves. Two copies of this rule would be the drift that makes
 * a card appear on reload but not live, or the other way round.
 *
 * Tags and statuses are matched by **name**, ignoring case and outer spaces:
 * each project has its own, so "Redaktionsplan" in two projects is two tags and
 * "In Progress" two statuses, and picking one name has to mean all of them.
 */
export const CALENDAR_MODES = ['week', 'month'] as const
export type CalendarMode = typeof CALENDAR_MODES[number]

/** The "Nobody" choice of the people filter. */
export const UNASSIGNED = '__none__'

export interface CalendarFilters {
  mode: CalendarMode
  tags: string[]
  people: string[]
  projects: string[]
  statuses: string[]
}

export const EMPTY_FILTERS: CalendarFilters = { mode: 'week', tags: [], people: [], projects: [], statuses: [] }

export const normalizeName = (name: string) => name.trim().toLowerCase()

export interface CalendarCardFacts {
  projectId: string
  assigneeId: string | null
  tags?: Array<{ name: string }>
}

/** Whether a card passes every filter that is set; an empty filter lets everything through. */
export function matchesCalendar(card: CalendarCardFacts, statusName: string | null | undefined, f: CalendarFilters): boolean {
  if (f.tags.length) {
    const wanted = new Set(f.tags.map(normalizeName))
    if (!(card.tags ?? []).some(t => wanted.has(normalizeName(t.name)))) return false
  }
  if (f.people.length && !f.people.includes(card.assigneeId ?? UNASSIGNED)) return false
  if (f.projects.length && !f.projects.includes(card.projectId)) return false
  if (f.statuses.length) {
    const wanted = new Set(f.statuses.map(normalizeName))
    if (!statusName || !wanted.has(normalizeName(statusName))) return false
  }
  return true
}
