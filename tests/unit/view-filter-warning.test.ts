import { describe, it, expect } from 'vitest'
import {
  filterCards,
  unmatchedFilters,
  describeUnmatchedFilters,
  type CardFilterState,
  type FilterableCard
} from '../../app/utils/card-filters'
import type { BaseCard } from '../../app/types/card'

/**
 * A card created on a filtered view says so before it is created.
 *
 * CF-434: a view filters client-side, so a card that misses its filters is saved
 * correctly and then never drawn — present in My Tasks and in search, absent
 * from the board that made it, with nothing said. The panel now tests the form
 * against the same filters and lists what is missing.
 *
 * The property worth guarding is not the wording. It is that the two answers
 * agree: whatever `filterCards` hides, `unmatchedFilters` must be able to
 * explain, and whatever it says nothing about must be visible. A warning that
 * disagrees with the board is worse than no warning, because it is the thing the
 * reader will trust.
 */

const STATUSES = [{ id: 's1', name: 'To Do' }, { id: 's2', name: 'Done' }]
const MEMBERS = [{ id: 'u1', name: 'Eric' }, { id: 'u2', name: 'Maria' }]
const TAGS = [{ id: 't1', name: 'Website' }, { id: 't2', name: 'Press' }]

const state = (p: Partial<CardFilterState> = {}): CardFilterState => ({
  statusIds: [], priorities: [], assigneeIds: [], tagIds: new Set(), ...p
})

const card = (p: Partial<FilterableCard> = {}): FilterableCard => ({
  statusId: 's1', priority: 'medium', assigneeId: null, tags: [], ...p
})

/** `filterCards` takes `BaseCard`; only the four filtered fields are read. */
const asBoardCard = (c: FilterableCard) => ({ ...c, id: 1 } as unknown as BaseCard)

const hidden = (c: FilterableCard, f: CardFilterState) => filterCards([asBoardCard(c)], f).length === 0

/**
 * Every combination of the four filters being active or not, against cards that
 * satisfy each subset — 16 filter shapes × 16 cards. Enumerated rather than
 * sampled: the bug being guarded is one filter type going unhandled, which a
 * couple of hand-picked cases would miss precisely when a fifth is added.
 */
const FILTERS: CardFilterState = state({
  statusIds: ['s1'], priorities: ['high'], assigneeIds: ['u1'], tagIds: new Set(['t1'])
})

const SATISFY = [
  (c: FilterableCard) => ({ ...c, statusId: 's1' }),
  (c: FilterableCard) => ({ ...c, priority: 'high' }),
  (c: FilterableCard) => ({ ...c, assigneeId: 'u1' }),
  (c: FilterableCard) => ({ ...c, tags: [{ id: 't1' }] })
]

const BREAK = [
  (c: FilterableCard) => ({ ...c, statusId: 's2' }),
  (c: FilterableCard) => ({ ...c, priority: 'low' }),
  (c: FilterableCard) => ({ ...c, assigneeId: null }),
  (c: FilterableCard) => ({ ...c, tags: [] })
]

describe('the warning agrees with the board', () => {
  for (let mask = 0; mask < 16; mask++) {
    const active = state({
      statusIds: mask & 1 ? FILTERS.statusIds : [],
      priorities: mask & 2 ? FILTERS.priorities : [],
      assigneeIds: mask & 4 ? FILTERS.assigneeIds : [],
      tagIds: mask & 8 ? FILTERS.tagIds : new Set()
    })

    for (let cm = 0; cm < 16; cm++) {
      let c = card()
      for (let bit = 0; bit < 4; bit++) c = (cm & (1 << bit) ? SATISFY : BREAK)[bit]!(c)

      it(`filters=${mask} card=${cm}: says nothing exactly when the card shows`, () => {
        expect(unmatchedFilters(c, active).length > 0).toBe(hidden(c, active))
      })
    }
  }
})

describe('what it names', () => {
  it('names only the filters the card fails', () => {
    const f = state({ priorities: ['high'], tagIds: new Set(['t1']) })
    const c = card({ priority: 'high' })
    expect(unmatchedFilters(c, f).map(u => u.field)).toEqual(['tags'])
  })

  it('shrinks as each filter is met, and empties', () => {
    const f = state({ priorities: ['high'], assigneeIds: ['u1'], tagIds: new Set(['t1']) })
    const steps = [
      card(),
      card({ priority: 'high' }),
      card({ priority: 'high', assigneeId: 'u1' }),
      card({ priority: 'high', assigneeId: 'u1', tags: [{ id: 't1' }] })
    ]
    expect(steps.map(c => unmatchedFilters(c, f).length)).toEqual([3, 2, 1, 0])
  })

  /** Any one value satisfies a filter, so the phrasing has to be a disjunction. */
  it('offers alternatives with "or", never "and"', () => {
    const f = state({ tagIds: new Set(['t1', 't2']) })
    const [line] = describeUnmatchedFilters(unmatchedFilters(card(), f), { statuses: STATUSES, members: MEMBERS, tags: TAGS })
    expect(line).toBe('a tag of Website or Press')
    // Either tag alone clears it — which is what makes "and" a lie.
    expect(unmatchedFilters(card({ tags: [{ id: 't2' }] }), f)).toEqual([])
  })

  it('reads each field as the thing you go and set', () => {
    const f = state({ statusIds: ['s1'], priorities: ['high'], assigneeIds: ['u1'], tagIds: new Set(['t1']) })
    const lines = describeUnmatchedFilters(
      unmatchedFilters(card({ statusId: 's2' }), f),
      { statuses: STATUSES, members: MEMBERS, tags: TAGS }
    )
    expect(lines).toEqual(['a status of To Do', 'priority High', 'assigned to Eric', 'a tag of Website'])
  })

  /**
   * A filter naming a tag someone has since deleted would otherwise render "a
   * tag of" and stop — a line that reads as a bug in the sentence rather than a
   * requirement on the card.
   */
  it('drops a filter it cannot name rather than printing half a line', () => {
    const f = state({ tagIds: new Set(['gone']) })
    expect(describeUnmatchedFilters(unmatchedFilters(card(), f), { statuses: STATUSES, members: MEMBERS, tags: TAGS })).toEqual([])
  })
})
