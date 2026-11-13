// The tracker interface's grouped issue list and project dates
// (app/utils/issue-list.ts).
import { describe, it, expect } from 'vitest'
import { formatProjectDate, formatShortDate, groupIssues, percent, walkOrder, type IssueRow } from '../../app/utils/issue-list'

const STATUS = {
  backlog: { id: 's-b', name: 'Backlog', category: 'backlog', color: '#bec2c8', position: 0 },
  todo: { id: 's-t', name: 'Todo', category: 'unstarted', color: null, position: 1 },
  progress: { id: 's-p', name: 'In Progress', category: 'started', color: '#f2c94c', position: 2 },
  deploy: { id: 's-w', name: 'In Review', category: 'started', color: null, position: 4 },
  done: { id: 's-d', name: 'Done', category: 'completed', color: '#5e6ad2', position: 7 },
  canceled: { id: 's-c', name: 'Canceled', category: 'canceled', color: null, position: 8 }
} as const

function issue(id: number, status: keyof typeof STATUS, extra: Partial<IssueRow> = {}): IssueRow {
  return {
    id,
    ticket: `P-${id}`,
    title: `Issue ${id}`,
    priority: null,
    dueDate: null,
    parentId: null,
    milestoneId: null,
    assigneeId: null,
    statusId: STATUS[status].id,
    projectId: 'p',
    position: 0,
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T10:00:00.000Z',
    status: { ...STATUS[status] },
    project: { id: 'p', name: 'P', slug: 'p', key: 'P', icon: null },
    assignee: null,
    milestone: null,
    blockingCount: 0,
    blockedByCount: 0,
    childProgress: null,
    ...extra
  }
}

const shape = (rows: IssueRow[]) => groupIssues(rows).map(g => [g.key, g.count, g.entries.map(e => `${'.'.repeat(e.depth)}${e.context ? '~' : ''}${e.issue.id}`)])

describe('groupIssues', () => {
  it('returns no groups for no issues', () => {
    expect(groupIssues([])).toEqual([])
  })

  it('orders groups by category (started, unstarted, backlog, closed) and by status position', () => {
    const rows = [issue(1, 'canceled'), issue(2, 'done'), issue(3, 'backlog'), issue(4, 'todo'), issue(5, 'deploy'), issue(6, 'progress')]
    expect(groupIssues(rows).map(g => g.key)).toEqual(['In Progress', 'In Review', 'Todo', 'Backlog', 'Done', 'Canceled'])
  })

  it('groups by status name across projects, so two projects share one Backlog', () => {
    const other = issue(2, 'backlog', { projectId: 'q' })
    other.status.id = 'other-backlog'
    expect(shape([issue(1, 'backlog'), other])).toEqual([['Backlog', 2, ['1', '2']]])
  })

  it('sorts by priority, then position, then id', () => {
    const rows = [issue(1, 'backlog', { position: 2 }), issue(2, 'backlog', { position: 1 }), issue(3, 'backlog', { priority: 'low' }), issue(4, 'backlog', { priority: 'urgent', position: 9 })]
    expect(shape(rows)).toEqual([['Backlog', 4, ['4', '3', '2', '1']]])
  })

  it('sorts by position, then id, when the ordering is manual', () => {
    const rows = [issue(1, 'backlog', { position: 2 }), issue(2, 'backlog', { position: 1 }), issue(3, 'backlog', { priority: 'low' }), issue(4, 'backlog', { priority: 'urgent', position: 9 })]
    expect(groupIssues(rows, 'manual').map(g => g.entries.map(e => e.issue.id))).toEqual([[3, 2, 1, 4]])
  })

  it('nests a sub-issue under its parent in the same group', () => {
    expect(shape([issue(1, 'backlog'), issue(2, 'backlog', { parentId: 1 }), issue(3, 'backlog')]))
      .toEqual([['Backlog', 3, ['1', '.2', '3']]])
  })

  it('shows the parent as an uncounted context line when the sub-issue is in another group', () => {
    const rows = [issue(186, 'backlog'), issue(194, 'deploy', { parentId: 186 }), issue(185, 'backlog')]
    expect(shape(rows)).toEqual([
      ['In Review', 1, ['~186', '.194']],
      ['Backlog', 2, ['185', '186']]
    ])
  })

  it('makes a sub-issue an ordinary row when its parent is not in the list', () => {
    expect(shape([issue(2, 'todo', { parentId: 1 })])).toEqual([['Todo', 1, ['2']]])
  })

  it('falls back to the category colour for a status without one', () => {
    const [group] = groupIssues([issue(1, 'todo')])
    expect(group!.color).toBe('#3b82f6')
  })
})

describe('formatProjectDate', () => {
  const now = new Date('2026-11-03T12:00:00Z')
  it('prints each resolution', () => {
    expect(formatProjectDate('2026-12-31', 'quarter', now)).toBe('Q4 2026')
    expect(formatProjectDate('2026-10-01', 'quarter', now)).toBe('Q4 2026')
    expect(formatProjectDate('2027-01-01', 'halfYear', now)).toBe('H1 2027')
    expect(formatProjectDate('2027-06-01', 'month', now)).toBe('Jun 2027')
    expect(formatProjectDate('2027-01-01', 'year', now)).toBe('2027')
    expect(formatProjectDate('2026-08-17', 'day', now)).toBe('Aug 17')
    expect(formatProjectDate('2027-08-17', null, now)).toBe('Aug 17 2027')
    expect(formatProjectDate(null, 'day', now)).toBeNull()
  })
})

describe('formatShortDate and percent', () => {
  it('prints the tracker row date and a rounded share', () => {
    const now = new Date('2026-11-03T12:00:00')
    expect(formatShortDate('2026-10-23T12:00:00', now)).toBe('Oct 23')
    expect(formatShortDate('2025-10-23T12:00:00', now)).toBe('Oct 23 2025')
    expect(percent(54, 115)).toBe(47)
    expect(percent(0, 0)).toBe(0)
  })
})

describe('the issue page walk', () => {
  it('steps through the list as drawn: groups in order, sub-issues under their parent, context parents left out', () => {
    const rows = [
      issue(1, 'progress', { position: 2 }),
      issue(2, 'todo', { position: 1 }),
      issue(3, 'progress', { position: 1 }),
      issue(4, 'todo', { parentId: 1, position: 0 }),
      issue(5, 'progress', { parentId: 3, position: 0 })
    ]
    // In Progress: 3, its sub-issue 5, then 1. To Do: 2, then 1 again as
    // dimmed context above its sub-issue 4 (not a step), then 4.
    expect(walkOrder(rows, 'manual').map(r => r.id)).toEqual([3, 5, 1, 2, 4])
  })
})
