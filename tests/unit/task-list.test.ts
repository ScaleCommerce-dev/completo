import { describe, it, expect } from 'vitest'
import { resetTaskList } from '../../shared/utils/task-list'

describe('resetTaskList', () => {
  it('unchecks every checked task-list item', () => {
    expect(resetTaskList('- [x] book venue\n- [ ] send invites\n- [X] order food'))
      .toBe('- [ ] book venue\n- [ ] send invites\n- [ ] order food')
  })

  it('handles *, + and numbered list markers and indented items', () => {
    expect(resetTaskList('* [x] a\n+ [x] b\n1. [x] c\n  - [x] nested'))
      .toBe('* [ ] a\n+ [ ] b\n1. [ ] c\n  - [ ] nested')
  })

  it('leaves a literal [x] that is not a list marker alone', () => {
    const text = 'Press [x] to close the dialog, see `[x]` in the docs.'
    expect(resetTaskList(text)).toBe(text)
  })

  it('returns an empty string for no description', () => {
    expect(resetTaskList(null)).toBe('')
    expect(resetTaskList(undefined)).toBe('')
  })
})
