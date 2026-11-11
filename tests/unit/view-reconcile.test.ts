import { describe, it, expect } from 'vitest'
import {
  cardBelongsToView,
  applyCardUpsert,
  applyCardDelete,
  columnNeedsResync
} from '../../app/utils/view-reconcile'

/**
 * The reconcile rules a live SSE event applies to a view's card array. These are
 * the branches `useProjectEvents` feeds `useViewData` — tested on a plain array so
 * the insert/update/evict decisions are checked without a Nuxt runtime.
 */

interface Row { id: number, statusId: string, title?: string, position?: number }

function rows(...r: Row[]): Row[] {
  return r
}

describe('cardBelongsToView', () => {
  const card: Row = { id: 1, statusId: 's2' }

  it('puts every project card on a list, regardless of status', () => {
    // The stream is already scoped to the project, so a list shows all of it.
    expect(cardBelongsToView('lists', [], card)).toBe(true)
    expect(cardBelongsToView('lists', ['s9'], card)).toBe(true)
  })

  it('puts a card on a board only when its status is one of the columns', () => {
    expect(cardBelongsToView('boards', ['s1', 's2', 's3'], card)).toBe(true)
    expect(cardBelongsToView('boards', ['s1', 's3'], card)).toBe(false)
    expect(cardBelongsToView('boards', [], card)).toBe(false)
  })
})

describe('applyCardUpsert', () => {
  it('inserts a card that is not present yet and belongs', () => {
    const cards = rows({ id: 1, statusId: 's1' })
    const action = applyCardUpsert(cards, { id: 2, statusId: 's1', title: 'new' }, true)
    expect(action).toBe('inserted')
    expect(cards.map(c => c.id)).toEqual([1, 2])
  })

  it('ignores a card that is absent and does not belong', () => {
    const cards = rows({ id: 1, statusId: 's1' })
    const action = applyCardUpsert(cards, { id: 2, statusId: 'sX' }, false)
    expect(action).toBe('ignored')
    expect(cards).toHaveLength(1)
  })

  it('merges into the existing row without replacing it', () => {
    const cards = rows({ id: 1, statusId: 's1', title: 'old', position: 0 })
    const original = cards[0]
    const action = applyCardUpsert(cards, { id: 1, statusId: 's2', title: 'new', position: 3 }, true)
    expect(action).toBe('updated')
    // Same object identity — Vue patches the card, it does not re-mount it.
    expect(cards[0]).toBe(original)
    expect(cards[0]).toMatchObject({ statusId: 's2', title: 'new', position: 3 })
  })

  it('evicts a present card that no longer belongs (moved off this board)', () => {
    const cards = rows({ id: 1, statusId: 's1' }, { id: 2, statusId: 's2' })
    // Card 2's status moved to one this board does not show.
    const action = applyCardUpsert(cards, { id: 2, statusId: 'sX' }, false)
    expect(action).toBe('removed')
    expect(cards.map(c => c.id)).toEqual([1])
  })
})

describe('applyCardDelete', () => {
  it('removes a present card and reports it', () => {
    const cards = rows({ id: 1, statusId: 's1' }, { id: 2, statusId: 's1' })
    expect(applyCardDelete(cards, 1)).toBe(true)
    expect(cards.map(c => c.id)).toEqual([2])
  })

  it('is a no-op for a card that was already gone', () => {
    const cards = rows({ id: 2, statusId: 's1' })
    expect(applyCardDelete(cards, 1)).toBe(false)
    expect(cards).toHaveLength(1)
  })
})

/**
 * `KanbanColumn` renders its own copy of the column's list (vuedraggable mutates
 * it in place) and replaces that copy when `columnNeedsResync` says so. Every
 * card patch after that, optimistic or live, goes to the view's rows, so the copy
 * has to hold those same rows or the patch never reaches the screen.
 */
describe('columnNeedsResync', () => {
  interface Card { id: number, assignee: { id: string } | null }

  /** The column's watcher, as `KanbanColumn` runs it on new props. */
  function sync(local: Card[], incoming: Card[]): Card[] {
    return columnNeedsResync(local, incoming) ? [...incoming] : local
  }

  it('renders a card patched after a view refetch', () => {
    let view: Card[] = [{ id: 1, assignee: null }, { id: 5, assignee: null }]
    let column = [...view]

    // refresh() replaces the view wholesale: same ids, same order, new objects.
    view = view.map(c => ({ ...c }))
    column = sync(column, view)

    // `useViewData.updateCard` patches the row it finds in the view by id.
    view.find(c => c.id === 5)!.assignee = { id: 'agent-claude' }

    expect(column.find(c => c.id === 5)!.assignee).toEqual({ id: 'agent-claude' })
  })

  it('keeps its list when handed the same rows again', () => {
    // Every patch recomputes the column's array without changing its rows; that
    // must not replace a list vuedraggable may be holding mid-drop.
    const view: Card[] = [{ id: 1, assignee: null }, { id: 5, assignee: null }]
    const column = [...view]
    expect(columnNeedsResync(column, [...view])).toBe(false)
  })

  it('resyncs when the order or the set of cards changes', () => {
    const a: Card = { id: 1, assignee: null }
    const b: Card = { id: 5, assignee: null }
    expect(columnNeedsResync([a, b], [b, a])).toBe(true)
    expect(columnNeedsResync([a, b], [a])).toBe(true)
  })
})
