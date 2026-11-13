// The tracker's relation picker: what a typed term means, and which issues it
// offers from a project (app/utils/issue-picker.ts).
import { describe, it, expect } from 'vitest'
import { classifyPickerTerm, pickerSuggestions, PICKER_SUGGESTIONS } from '../../app/utils/issue-picker'
import type { IssueRow } from '../../app/utils/issue-list'

const PROJECTS = [{ id: 'p-tk', key: 'TK' }, { id: 'p-ops', key: 'OPS' }]

describe('classifyPickerTerm', () => {
  it('suggests the card\'s project when nothing is typed', () => {
    expect(classifyPickerTerm('', PROJECTS)).toEqual({ kind: 'suggest' })
    expect(classifyPickerTerm('   ', PROJECTS)).toEqual({ kind: 'suggest' })
  })

  it('browses a project for its key, with or without the dash, in any case', () => {
    for (const term of ['tk', 'TK', 'tk-', 'TK-', ' Tk- ']) {
      expect(classifyPickerTerm(term, PROJECTS)).toEqual({ kind: 'project', projectId: 'p-tk', numberPrefix: '' })
    }
  })

  it('narrows a browsed project by the digits after the dash', () => {
    expect(classifyPickerTerm('TK-4', PROJECTS)).toEqual({ kind: 'project', projectId: 'p-tk', numberPrefix: '4' })
    expect(classifyPickerTerm('ops-12', PROJECTS)).toEqual({ kind: 'project', projectId: 'p-ops', numberPrefix: '12' })
  })

  it('searches anything that is not a key the viewer can see', () => {
    expect(classifyPickerTerm('login', PROJECTS)).toEqual({ kind: 'search', q: 'login' })
    expect(classifyPickerTerm('XY-3', PROJECTS)).toEqual({ kind: 'search', q: 'XY-3' })
    expect(classifyPickerTerm('42', PROJECTS)).toEqual({ kind: 'search', q: '42' })
    expect(classifyPickerTerm('tk bug', PROJECTS)).toEqual({ kind: 'search', q: 'tk bug' })
  })
})

function row(id: number, category: IssueRow['status']['category'], updatedAt: string): IssueRow {
  return {
    id,
    ticket: `TK-${id}`,
    title: `Issue ${id}`,
    priority: null,
    dueDate: null,
    parentId: null,
    milestoneId: null,
    assigneeId: null,
    statusId: `s-${category}`,
    projectId: 'p-tk',
    position: 0,
    createdAt: updatedAt,
    updatedAt,
    status: { id: `s-${category}`, name: category, category, color: null, position: 0 },
    project: { id: 'p-tk', name: 'TK', slug: 'tk', key: 'TK', icon: null },
    assignee: null,
    milestone: null,
    blockingCount: 0,
    blockedByCount: 0,
    childProgress: null
  } as IssueRow
}

describe('pickerSuggestions', () => {
  const issues = [
    row(1, 'started', '2026-11-01T00:00:00.000Z'),
    row(2, 'backlog', '2026-11-03T00:00:00.000Z'),
    row(3, 'completed', '2026-11-05T00:00:00.000Z'),
    row(4, 'unstarted', '2026-11-02T00:00:00.000Z'),
    row(41, 'canceled', '2026-11-06T00:00:00.000Z'),
    row(45, 'started', '2026-11-04T00:00:00.000Z')
  ]

  it('offers open issues, backlog included, most recently updated first', () => {
    expect(pickerSuggestions(issues).map(i => i.id)).toEqual([45, 2, 4, 1])
  })

  it('leaves out the excluded issues', () => {
    expect(pickerSuggestions(issues, { exclude: [2, 45] }).map(i => i.id)).toEqual([4, 1])
  })

  it('keeps the numbers that start with the typed digits', () => {
    expect(pickerSuggestions(issues, { numberPrefix: '4' }).map(i => i.id)).toEqual([45, 4])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: 15 }, (_, n) => row(n + 1, 'started', `2026-11-${String(n + 1).padStart(2, '0')}T00:00:00.000Z`))
    expect(pickerSuggestions(many)).toHaveLength(PICKER_SUGGESTIONS)
  })
})
