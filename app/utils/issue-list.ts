import { CATEGORY_COLORS, STATUS_CATEGORIES, type DateResolution, type ProjectState, type StatusCategory } from '../../shared/utils/workflow'
import type { PersonRef } from '~/types/card'

/**
 * The tracker interface's issue lists: one row shape (`GET /api/issues`), the
 * grouping by status, and the date and progress formats its rows print.
 */

/** One row of `GET /api/issues`. */
export interface IssueRow {
  id: number
  /** `KEY-42`: the project key and the card id. */
  ticket: string
  title: string
  priority: string | null
  dueDate: string | null
  parentId: number | null
  milestoneId: string | null
  assigneeId: string | null
  statusId: string
  projectId: string
  position: number
  createdAt: string
  updatedAt: string
  /** Set on an archived issue, which only `archived=include` returns. */
  archivedAt?: string | null
  status: { id: string, name: string, category: StatusCategory, color: string | null, position: number }
  project: { id: string, name: string, slug: string, key: string, icon: string | null }
  assignee: PersonRef | null
  milestone: { id: string, name: string } | null
  blockingCount: number
  blockedByCount: number
  childProgress: { total: number, completed: number } | null
}

/** Where an issue's own page is: under its project, by ticket. */
export function issuePath(issue: { ticket: string, project: { slug: string } }): string {
  return `/projects/${issue.project.slug}/cards/${issue.ticket}`
}

/**
 * A line of the list. `context` is a parent shown dimmed above a sub-issue
 * whose own status puts it in another group; it is not counted.
 */
export interface IssueEntry {
  issue: IssueRow
  depth: number
  context: boolean
}

export interface IssueGroup {
  /** Status name: views across projects group by name, every project has its own status rows. */
  key: string
  category: StatusCategory
  color: string
  count: number
  entries: IssueEntry[]
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/** The tracker's two orderings: priority first, or the order people dragged into. */
export type IssueOrdering = 'priority' | 'manual'

function comparator(ordering: IssueOrdering) {
  return (a: IssueRow, b: IssueRow) =>
    (ordering === 'priority' ? (PRIORITY_RANK[a.priority ?? ''] ?? 4) - (PRIORITY_RANK[b.priority ?? ''] ?? 4) : 0)
    || a.position - b.position
    || a.id - b.id
}

/** A status's colour, or its category's when it has none. */
export function statusColor(status: { category: StatusCategory, color: string | null }): string {
  return status.color || CATEGORY_COLORS[status.category]
}

/**
 * The tracker's grouped list: one group per status name, in category order
 * (started, unstarted, backlog, completed, canceled, duplicate) and by status
 * position within a category. A sub-issue sits indented under its parent when
 * the parent is in the list; if the parent's status puts it in another group,
 * the parent appears there as a dimmed context line. A sub-issue whose parent
 * is not in the list is an ordinary row.
 */
export function groupIssues(rows: IssueRow[], ordering: IssueOrdering = 'priority'): IssueGroup[] {
  const compareIssues = comparator(ordering)
  const byId = new Map(rows.map(r => [r.id, r]))
  const buckets = new Map<string, IssueRow[]>()
  for (const r of rows) {
    const bucket = buckets.get(r.status.name)
    if (bucket) bucket.push(r)
    else buckets.set(r.status.name, [r])
  }

  const groups: Array<IssueGroup & { sort: [number, number] }> = []
  for (const [name, members] of buckets) {
    const first = members[0]!.status
    const inGroup = new Set(members.map(r => r.id))
    const children = new Map<number, IssueRow[]>()
    const roots: IssueRow[] = []
    const context = new Set<number>()

    for (const r of members) {
      const parent = r.parentId != null ? byId.get(r.parentId) : undefined
      if (!parent) {
        roots.push(r)
        continue
      }
      const siblings = children.get(parent.id)
      if (siblings) siblings.push(r)
      else children.set(parent.id, [r])
      if (!inGroup.has(parent.id) && !context.has(parent.id)) {
        context.add(parent.id)
        roots.push(parent)
      }
    }

    const entries: IssueEntry[] = []
    const emit = (issue: IssueRow, depth: number) => {
      entries.push({ issue, depth, context: context.has(issue.id) })
      for (const child of (children.get(issue.id) ?? []).sort(compareIssues)) emit(child, depth + 1)
    }
    for (const r of roots.sort(compareIssues)) emit(r, 0)

    groups.push({
      key: name,
      category: first.category,
      color: statusColor(members.find(m => m.status.color)?.status ?? first),
      count: members.length,
      entries,
      sort: [STATUS_CATEGORIES.indexOf(first.category), first.position]
    })
  }

  return groups
    .sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.key.localeCompare(b.key))
    .map(({ sort: _sort, ...g }) => g)
}

/**
 * The issues in the order the list shows them, for stepping through them on
 * the issue page (j / k and `n / m`): groups top to bottom, each group's rows
 * as drawn. A parent shown dimmed above a sub-issue in another group is left
 * out there, as it is counted in its own group.
 */
export function walkOrder(rows: IssueRow[], ordering: IssueOrdering): IssueRow[] {
  return groupIssues(rows, ordering).flatMap(g => g.entries.filter(e => !e.context).map(e => e.issue))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A project date at its stored precision: "Q4 2026" for a quarter, "Dec 2026"
 * for a month, "Aug 17" for a day (with the year when it is not this year).
 * Read from the month rather than from the stored day, so a period stored by
 * a client as its last day (2026-12-31 for Q4) still prints as its period.
 */
export function formatProjectDate(date: string | null | undefined, resolution: DateResolution | null | undefined, now = new Date()): string | null {
  if (!date) return null
  const [y, m, d] = date.slice(0, 10).split('-').map(Number) as [number, number, number]
  switch (resolution) {
    case 'year': return `${y}`
    case 'halfYear': return `H${m <= 6 ? 1 : 2} ${y}`
    case 'quarter': return `Q${Math.ceil(m / 3)} ${y}`
    case 'month': return `${MONTHS[m - 1]} ${y}`
    default: return `${MONTHS[m - 1]} ${d}${y === now.getFullYear() ? '' : ` ${y}`}`
  }
}

/** A row's date as the lists print it: "Oct 23", with the year only when it is not this year. */
export function formatShortDate(iso: string, now = new Date()): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`
}

/** Closed share in whole percent; 0 for an empty scope. */
export function percent(completed: number, total: number): number {
  return total ? Math.round((completed / total) * 100) : 0
}

/**
 * A project's icon, a cube when it has none. The fallback is spelled
 * out here because Nuxt Icon bundles only names it finds as literals.
 */
export function projectIcon(icon: string | null | undefined): string {
  return icon ? `i-lucide-${icon}` : 'i-lucide-box'
}

/** The tracker's project states, drawn with the issue status glyph of a category. */
export const PROJECT_STATE_META: Record<ProjectState, { label: string, category: StatusCategory }> = {
  backlog: { label: 'Backlog', category: 'backlog' },
  planned: { label: 'Planned', category: 'unstarted' },
  started: { label: 'In Progress', category: 'started' },
  paused: { label: 'Paused', category: 'started' },
  completed: { label: 'Completed', category: 'completed' },
  canceled: { label: 'Canceled', category: 'canceled' }
}

/** Periods a project date can be set to, per resolution, with their first month. */
export const DATE_PERIODS: Record<Exclude<DateResolution, 'day'>, Array<{ label: string, month: number }>> = {
  month: MONTHS.map((label, i) => ({ label, month: i + 1 })),
  quarter: [1, 2, 3, 4].map(q => ({ label: `Q${q}`, month: q * 3 - 2 })),
  halfYear: [1, 2].map(h => ({ label: `H${h}`, month: h * 6 - 5 })),
  year: [{ label: 'Whole year', month: 1 }]
}

/** A period stored as its first day, as the schema has it: Q4 2026 is 2026-10-01. */
export function periodStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}
