/**
 * The vocabulary of the issue workflow (sub-issues, relations, milestones,
 * project state), shared by schema, API and UI.
 *
 * Status categories are the kinds of work a status stands for. Their order
 * here is the order of status groups in issue lists: open work first, closed
 * work last.
 */
export const STATUS_CATEGORIES = ['started', 'unstarted', 'backlog', 'completed', 'canceled', 'duplicate'] as const
export type StatusCategory = typeof STATUS_CATEGORIES[number]

/** Categories that count as closed: no longer open work, for "Active" and collapsed groups. */
export const CLOSED_CATEGORIES: readonly StatusCategory[] = ['completed', 'canceled', 'duplicate']

/**
 * Progress of a project or milestone: canceled and duplicate issues leave the
 * scope, and only completed ones count as done.
 */
export function progressOf(categories: readonly StatusCategory[]): { scope: number, completed: number } {
  const inScope = categories.filter(c => c !== 'canceled' && c !== 'duplicate')
  return { scope: inScope.length, completed: inScope.filter(c => c === 'completed').length }
}

/**
 * The category a status gets from its name, for the statuses a new project
 * starts with and for existing statuses when categories arrived. Anything
 * unrecognised is plain open work.
 */
export function categoryForStatusName(name: string): StatusCategory {
  const n = name.trim().toLowerCase()
  if (n === 'backlog') return 'backlog'
  if (['in progress', 'doing', 'review', 'in review'].includes(n)) return 'started'
  if (n === 'done' || n === 'completed') return 'completed'
  if (n === 'canceled' || n === 'cancelled') return 'canceled'
  if (n === 'duplicate') return 'duplicate'
  return 'unstarted'
}

export const PROJECT_STATES = ['backlog', 'planned', 'started', 'paused', 'completed', 'canceled'] as const
export type ProjectState = typeof PROJECT_STATES[number]

/** How precise a project date is: "Q4 2026" is a quarter, stored as its first day. */
export const DATE_RESOLUTIONS = ['day', 'month', 'quarter', 'halfYear', 'year'] as const
export type DateResolution = typeof DATE_RESOLUTIONS[number]

/** What is stored. `blocked_by` is a `blocks` row read from its other end. */
export const RELATION_TYPES = ['blocks', 'relates'] as const
export type RelationType = typeof RELATION_TYPES[number]

/** What a client asks for when it links two cards. */
export const RELATION_KINDS = ['blocks', 'blocked_by', 'relates'] as const
export type RelationKind = typeof RELATION_KINDS[number]

/** What the project activity feed records about the project itself. */
export const PROJECT_ACTIVITY_TYPES = [
  'name',
  'description',
  'state',
  'priority',
  'lead',
  'start_date',
  'target_date',
  'member_added',
  'member_removed',
  'milestone_added',
  'milestone_renamed',
  'milestone_removed'
] as const
export type ProjectActivityType = typeof PROJECT_ACTIVITY_TYPES[number]

/** Colour of a status by category, for statuses created without one. */
export const CATEGORY_COLORS: Record<StatusCategory, string> = {
  backlog: '#a1a1aa',
  unstarted: '#3b82f6',
  started: '#f59e0b',
  completed: '#10b981',
  canceled: '#71717a',
  duplicate: '#71717a'
}

/** A real calendar day as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
