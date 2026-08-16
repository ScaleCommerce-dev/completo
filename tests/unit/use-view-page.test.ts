import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { BaseCard } from '../../app/types/card'
import {
  filterCards,
  hasActiveFilters,
  countActiveFilters,
  buildFilterSummary
} from '../../app/utils/card-filters'
import type { CardFilterState } from '../../app/utils/card-filters'

const ROOT = join(import.meta.dirname, '../..')

function makeCard(overrides: Partial<BaseCard> & { id: number, statusId: string }): BaseCard {
  return {
    projectId: 'p1',
    title: `Card ${overrides.id}`,
    description: null,
    assigneeId: null,
    priority: 'medium',
    dueDate: null,
    position: 0,
    assignee: null,
    tags: [],
    attachmentCount: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides
  }
}

function noFilters(): CardFilterState {
  return { statusIds: [], priorities: [], assigneeIds: [], tagIds: new Set() }
}

const CARDS: BaseCard[] = [
  makeCard({ id: 1, statusId: 's-todo', priority: 'urgent', assigneeId: 'u-alice', tags: [{ id: 't-bug', name: 'Bug', color: '#f00' }] }),
  makeCard({ id: 2, statusId: 's-todo', priority: 'medium', assigneeId: 'u-bob', tags: [{ id: 't-feat', name: 'Feature', color: '#00f' }] }),
  makeCard({ id: 3, statusId: 's-progress', priority: 'high', assigneeId: 'u-alice', tags: [{ id: 't-bug', name: 'Bug', color: '#f00' }] }),
  makeCard({ id: 4, statusId: 's-progress', priority: 'low', assigneeId: null, tags: [] }),
  makeCard({ id: 5, statusId: 's-done', priority: 'medium', assigneeId: 'u-bob', tags: [{ id: 't-feat', name: 'Feature', color: '#00f' }] })
]

describe('filterCards', () => {
  it('returns all cards when no filters active', () => {
    expect(filterCards(CARDS, noFilters())).toHaveLength(5)
  })

  it('filters by status', () => {
    const f = { ...noFilters(), statusIds: ['s-todo'] }
    expect(filterCards(CARDS, f)).toHaveLength(2)
  })

  it('filters by priority', () => {
    const f = { ...noFilters(), priorities: ['urgent'] }
    const result = filterCards(CARDS, f)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('filters by assignee', () => {
    const f = { ...noFilters(), assigneeIds: ['u-alice'] }
    expect(filterCards(CARDS, f)).toHaveLength(2)
  })

  it('excludes cards without assignee when assignee filter set', () => {
    const f = { ...noFilters(), assigneeIds: ['u-alice', 'u-bob'] }
    const result = filterCards(CARDS, f)
    expect(result).toHaveLength(4)
    expect(result.find(c => c.id === 4)).toBeUndefined()
  })

  it('filters by tag', () => {
    const f = { ...noFilters(), tagIds: new Set(['t-bug']) }
    const result = filterCards(CARDS, f)
    expect(result).toHaveLength(2)
    expect(result.map(c => c.id)).toEqual([1, 3])
  })

  it('applies AND logic across filter types', () => {
    const f: CardFilterState = {
      statusIds: ['s-todo'],
      priorities: ['urgent'],
      assigneeIds: [],
      tagIds: new Set()
    }
    const result = filterCards(CARDS, f)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('applies OR logic within a filter type', () => {
    const f = { ...noFilters(), statusIds: ['s-todo', 's-progress'] }
    expect(filterCards(CARDS, f)).toHaveLength(4)
  })

  it('handles cards with no tags when tag filter set', () => {
    const f = { ...noFilters(), tagIds: new Set(['t-feat']) }
    const result = filterCards(CARDS, f)
    expect(result).toHaveLength(2)
    expect(result.map(c => c.id)).toEqual([2, 5])
  })

  it('includes done cards when no filters', () => {
    const result = filterCards(CARDS, noFilters())
    expect(result.find(c => c.statusId === 's-done')).toBeDefined()
  })
})

describe('hasActiveFilters', () => {
  it('returns false when no filters active', () => {
    expect(hasActiveFilters(noFilters())).toBe(false)
  })

  it('returns true for status filter', () => {
    expect(hasActiveFilters({ ...noFilters(), statusIds: ['s-todo'] })).toBe(true)
  })

  it('returns true for priority filter', () => {
    expect(hasActiveFilters({ ...noFilters(), priorities: ['high'] })).toBe(true)
  })

  it('returns true for assignee filter', () => {
    expect(hasActiveFilters({ ...noFilters(), assigneeIds: ['u-alice'] })).toBe(true)
  })

  it('returns true for tag filter', () => {
    expect(hasActiveFilters({ ...noFilters(), tagIds: new Set(['t-bug']) })).toBe(true)
  })
})

describe('countActiveFilters', () => {
  it('returns 0 when no filters active', () => {
    expect(countActiveFilters(noFilters())).toBe(0)
  })

  it('sums all active filter values', () => {
    const f: CardFilterState = {
      statusIds: ['s-todo', 's-progress'],
      priorities: ['urgent'],
      assigneeIds: ['u-alice'],
      tagIds: new Set(['t-bug', 't-feat'])
    }
    expect(countActiveFilters(f)).toBe(6)
  })
})

describe('buildFilterSummary', () => {
  const lookup = {
    statuses: [{ id: 's-todo', name: 'To Do' }, { id: 's-progress', name: 'In Progress' }],
    members: [{ id: 'u-alice', name: 'Alice' }, { id: 'u-bob', name: 'Bob' }],
    tags: [{ id: 't-bug', name: 'Bug' }, { id: 't-feat', name: 'Feature' }]
  }

  it('returns empty string when no filters active', () => {
    expect(buildFilterSummary(noFilters(), lookup)).toBe('')
  })

  it('includes status names', () => {
    const f = { ...noFilters(), statusIds: ['s-todo'] }
    expect(buildFilterSummary(f, lookup)).toBe('Status: To Do')
  })

  it('capitalizes priority names', () => {
    const f = { ...noFilters(), priorities: ['urgent', 'high'] }
    expect(buildFilterSummary(f, lookup)).toBe('Priority: Urgent, High')
  })

  it('includes assignee names', () => {
    const f = { ...noFilters(), assigneeIds: ['u-alice'] }
    expect(buildFilterSummary(f, lookup)).toBe('Assignee: Alice')
  })

  it('includes tag names', () => {
    const f = { ...noFilters(), tagIds: new Set(['t-bug']) }
    expect(buildFilterSummary(f, lookup)).toBe('Tags: Bug')
  })

  it('joins multiple filter types with newlines', () => {
    const f: CardFilterState = {
      statusIds: ['s-todo'],
      priorities: ['urgent'],
      assigneeIds: ['u-alice'],
      tagIds: new Set(['t-bug'])
    }
    const result = buildFilterSummary(f, lookup)
    expect(result).toBe('Status: To Do\nPriority: Urgent\nAssignee: Alice\nTags: Bug')
  })
})

/**
 * ViewConfigModal offers a section only where the surface can act on it.
 *
 * Its priority chips are four literals that need no props, so the Filters tab
 * drew itself on every consumer — including My Tasks, which spans all projects,
 * has no view to store a filter against, and does not listen for
 * `update-filters`. Toggling a chip there enabled Save, and Save closed the
 * dialog having emitted into nothing.
 *
 * The invariant is a pair, and neither half is visible from inside either file:
 * a consumer that hands the modal filter state must handle the event it will
 * emit, and one that handles the event must hand it the state to seed from.
 */
describe('ViewConfigModal consumers', () => {
  const CONSUMERS = [
    'app/pages/my-tasks.vue',
    'app/pages/projects/[slug]/lists/[listSlug]/index.vue',
    'app/pages/projects/[slug]/boards/[boardSlug]/index.vue'
  ]

  /** The `<ViewConfigModal …>` opening tag, where props and listeners both live. */
  function usage(file: string): string {
    const src = readFileSync(join(ROOT, file), 'utf8')
    const at = src.indexOf('<ViewConfigModal')
    expect(at, `${file} renders ViewConfigModal`).toBeGreaterThan(-1)
    return src.slice(at, src.indexOf('/>', at))
  }

  it.each(CONSUMERS)('%s pairs filter state with a filter handler', (file) => {
    const tag = usage(file)
    const seeds = /:active-(tag|status|assignee|priority)-filters=/.test(tag)
    const handles = /@update-filters=/.test(tag)
    expect(handles, seeds
      ? 'passes active filters, so it must handle update-filters'
      : 'passes no active filters, so the Filters tab is hidden and this handler is dead')
      .toBe(seeds)
  })

  it('covers every consumer in the repo', () => {
    // A fourth surface added without a line here is the way this goes stale.
    const found = execSync(`grep -rl '<ViewConfigModal' ${ROOT}/app/pages ${ROOT}/app/components`, { encoding: 'utf8' })
      .trim().split('\n').map(p => p.replace(ROOT + '/', '')).sort()
    expect(found).toEqual([...CONSUMERS].sort())
  })
})
