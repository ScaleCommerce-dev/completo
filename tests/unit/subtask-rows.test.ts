import { describe, it, expect } from 'vitest'
import { nestUnderParents } from '../../app/utils/subtasks'

const ids = (rows: Array<{ id: number }>) => rows.map(r => r.id)

describe('nestUnderParents', () => {
  it('moves each sub-task directly under its parent, keeping the sort on both levels', () => {
    // Sorted as the table sorted them: 7 and 9 are sub-tasks of 5, 8 of 2.
    const rows = [
      { id: 7, parentId: 5 },
      { id: 2 },
      { id: 9, parentId: 5 },
      { id: 5 },
      { id: 8, parentId: 2 },
      { id: 3 }
    ]
    expect(ids(nestUnderParents(rows))).toEqual([2, 8, 5, 7, 9, 3])
  })

  it('leaves a sub-task where the sort put it when its parent is not a row', () => {
    const rows = [{ id: 4 }, { id: 7, parentId: 99 }, { id: 1 }]
    expect(ids(nestUnderParents(rows))).toEqual([4, 7, 1])
  })

  it('keeps every row exactly once', () => {
    const rows = [{ id: 3, parentId: 1 }, { id: 1 }, { id: 2, parentId: 1 }, { id: 4, parentId: 6 }]
    const out = ids(nestUnderParents(rows))
    expect([...out].sort()).toEqual([1, 2, 3, 4])
    expect(out).toEqual([1, 3, 2, 4])
  })
})
