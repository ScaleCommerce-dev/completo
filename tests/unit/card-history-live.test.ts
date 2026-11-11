import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCardHistory } from '../../app/composables/useCardHistory'
import type { CardHistoryEvent } from '../../app/utils/card-history'

/**
 * The panel's history while it is open: what it fetches, and that nothing it
 * has already shown falls out when more arrives.
 *
 * Driven against an in-memory endpoint that speaks the real query contract
 * (`limit`, `before`, `after`), with the composable's auto-imports stubbed the
 * way `api-tokens.test.ts` does it. `vue` is not resolvable from here (pnpm keeps
 * it inside nuxt), so `ref` and `watch` are the smallest pair that behaves alike
 * for refs, which is all the composable watches.
 */

interface TinyRef<T> { value: T, watchers: Set<(next: T, prev: T) => void> }

function ref<T>(initial: T): TinyRef<T> {
  let current = initial
  const watchers = new Set<(next: T, prev: T) => void>()
  return {
    watchers,
    get value() { return current },
    set value(next: T) {
      const prev = current
      current = next
      if (next !== prev) for (const w of watchers) w(next, prev)
    }
  }
}

function watch<T>(source: TinyRef<T>, cb: (next: T, prev: T | undefined) => void, opts?: { immediate?: boolean }) {
  source.watchers.add(cb)
  if (opts?.immediate) cb(source.value, undefined)
}

const CARD = 7
const PROJECT = 'project-1'

function fakeHistory(count: number) {
  const rows: CardHistoryEvent[] = []
  let next = 1
  const add = (n: number) => {
    for (let i = 0; i < n; i++) {
      const id = next++
      rows.push({ id, field: 'priority', from: null, to: { id: null, value: 'high' }, actor: null, actorName: 'Claude', createdAt: new Date(1_800_000_000_000 + id).toISOString() })
    }
  }
  add(count)
  const created: CardHistoryEvent = { id: 0, field: 'created', from: null, to: null, actor: null, actorName: 'Ann', createdAt: new Date(1_800_000_000_000).toISOString() }
  const requests: Array<Record<string, number>> = []

  function respond(query: Record<string, number> = {}) {
    requests.push(query)
    const limit = query.limit ?? 200
    const total = rows.length + 1
    if (query.after !== undefined) {
      const newer = rows.filter(r => r.id > query.after!)
      return { events: newer.slice(0, limit), hasMore: newer.length > limit, total, projectId: PROJECT }
    }
    const older = query.before !== undefined ? rows.filter(r => r.id < query.before!) : rows
    const hasMore = older.length > limit
    const page = older.slice(-limit)
    return { events: hasMore ? page : [created, ...page], hasMore, total, projectId: PROJECT }
  }

  return { rows, add, requests, respond }
}

describe('useCardHistory', () => {
  let server: ReturnType<typeof fakeHistory>
  let stream: { projectId: () => string | null | undefined, handlers: { onCardUpsert?: (card: { id: number }) => void, onViewInvalidate?: () => void } } | null
  let hold: Array<() => void> | null

  beforeEach(() => {
    vi.useFakeTimers()
    stream = null
    hold = null
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onScopeDispose', () => {})
    vi.stubGlobal('useProjectEvents', (projectId: () => string | null | undefined, handlers: NonNullable<typeof stream>['handlers']) => {
      stream = { projectId, handlers }
    })
    // `hold` set: responses wait until released, in whatever order the test picks.
    vi.stubGlobal('$fetch', (_url: string, opts?: { query?: Record<string, number> }) => {
      const body = server.respond(opts?.query)
      if (!hold) return Promise.resolve(body)
      return new Promise((resolve) => {
        hold!.push(() => resolve(body))
      })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function mount(opts: { wanted?: boolean } = {}) {
    const wanted = ref(opts.wanted ?? true)
    const history = useCardHistory(ref(CARD) as never, wanted as never)
    return { history, wanted }
  }

  /** A change landed: the stream says so, and the debounce runs out. */
  async function changed(cardId = CARD) {
    stream!.handlers.onCardUpsert?.({ id: cardId })
    await vi.advanceTimersByTimeAsync(500)
  }

  it('keeps the creation and every loaded entry when a burst arrives', async () => {
    server = fakeHistory(60)
    const { history } = mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(history.events.value).toHaveLength(61)

    server.add(50)
    await changed()

    expect(history.events.value.map(e => e.id)).toEqual([0, ...server.rows.map(r => r.id)])
    expect(history.hasMore.value).toBe(false)
    expect(history.total.value).toBe(111)
  })

  it('keeps the pages read with "Show earlier changes"', async () => {
    server = fakeHistory(250)
    const { history } = mount()
    await vi.advanceTimersByTimeAsync(0)
    while (history.hasMore.value) await history.loadEarlier()
    expect(history.events.value).toHaveLength(251)

    server.add(5)
    await changed()

    expect(history.events.value).toHaveLength(256)
    expect(history.events.value[0]!.field).toBe('created')
  })

  it('reads only what is new when something changes', async () => {
    server = fakeHistory(10)
    mount()
    await vi.advanceTimersByTimeAsync(0)
    server.add(2)
    await changed()
    expect(server.requests.at(-1)).toMatchObject({ after: 10 })
  })

  it('does not let a refresh and an earlier page throw each other away', async () => {
    server = fakeHistory(150)
    const { history } = mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(history.hasMore.value).toBe(true)

    hold = []
    const earlier = history.loadEarlier()
    server.add(3)
    await changed()
    // The refresh answers first, then the earlier page.
    hold[1]!()
    await vi.advanceTimersByTimeAsync(0)
    hold[0]!()
    await earlier

    expect(history.events.value.map(e => e.id)).toEqual([0, ...server.rows.map(r => r.id)])
  })

  it('reads only the count while the comments are showing, and the page once changes are', async () => {
    server = fakeHistory(30)
    const { history, wanted } = mount({ wanted: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(server.requests).toEqual([{ limit: 1 }])
    expect(history.total.value).toBe(31)
    expect(history.events.value).toEqual([])

    wanted.value = true
    await vi.advanceTimersByTimeAsync(0)
    expect(history.events.value).toHaveLength(31)
  })

  it('follows the card on its project\'s stream, whichever page hosts it', async () => {
    server = fakeHistory(3)
    mount()
    await vi.advanceTimersByTimeAsync(0)
    expect(stream?.projectId()).toBe(PROJECT)

    const before = server.requests.length
    await changed(CARD + 1)
    expect(server.requests).toHaveLength(before)

    await changed()
    expect(server.requests).toHaveLength(before + 1)

    stream!.handlers.onViewInvalidate?.()
    await vi.advanceTimersByTimeAsync(500)
    expect(server.requests).toHaveLength(before + 2)
  })
})
