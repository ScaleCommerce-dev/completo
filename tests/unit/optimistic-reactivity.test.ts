import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Guards the one non-obvious requirement of optimistic card mutations.
 *
 * `useViewData` patches `data.value.cards[i]` in place instead of refetching. That
 * only reaches the UI if the fetched data is deeply reactive — and Nuxt's
 * `useFetch` defaults to a `shallowRef`, so `data.value.cards[i]` is a *raw*
 * object unless `deep: true` is passed.
 *
 * Without it the mutation still hits the API and still writes to the local
 * object, so nothing looks broken in a network log or a database check. What
 * breaks is the render: the board keeps showing the previous value until
 * something unrelated forces a re-render, which a closing popover or dialog
 * happens to do. That made the bug present intermittently and pass a casual test.
 *
 * It was survivable while every mutation ended in `refresh()`, because that
 * replaces `data.value` wholesale and a shallowRef notices a replacement. Once
 * the refetch went away, `deep: true` became load-bearing.
 *
 * The integration suite cannot catch this: it talks HTTP to a built server and
 * never mounts the Vue app.
 */
describe('optimistic card mutations', () => {
  const src = readFileSync(join(ROOT, 'app/composables/useViewData.ts'), 'utf8')

  it('fetches view data deeply reactive, or in-place patches never render', () => {
    expect(src).toMatch(/useFetch<T>\([\s\S]*?deep:\s*true/)
  })

  it('patches the local row instead of refetching', () => {
    // A `refresh()` inside updateCard/deleteCard/updateCardTags would reintroduce
    // the full-view refetch these replaced.
    const mutators = src.slice(src.indexOf('async function updateCard'))
    const upToReorder = mutators.slice(0, mutators.indexOf('reorderColumns'))
    expect(upToReorder).not.toMatch(/await refresh\(\)/)
  })

  it('keeps nested status and assignee in step with their ids', () => {
    // The PUT response resolves `assignee` but never `status`, and the optimistic
    // paint has to happen before any response arrives either way.
    expect(src).toMatch(/function resolveNested/)
    expect(src).toMatch(/card\.status\s*=/)
    expect(src).toMatch(/card\.assignee\s*=/)
  })

  it('restores a snapshot when a mutation is rejected', () => {
    expect(src).toMatch(/snapshot/)
    expect(src).toMatch(/catch[\s\S]*?Object\.assign\(found\.card, snapshot\)/)
  })
})

/**
 * A rejected *move* needs more than the rollback its sibling above gets.
 *
 * `moveCard` snapshots every card on the board, because renumbering one column
 * touches all of them. That makes the snapshot a picture of the whole board at
 * drag-start rather than of the thing being changed, so replaying it also
 * un-does anything that landed in between — drag A, drag B, A's PUT fails, and
 * B's server-accepted move vanishes from the board while the database keeps it.
 * The same snapshot is already stale in the case that causes most rejections:
 * one issued *because* server state moved.
 *
 * So the rollback is the immediate response and the refetch is the correction.
 * Both, in that order: the rollback needs no network, and whatever failed the
 * PUT will often fail the GET too.
 */
describe('a rejected card move reconciles with the server', () => {
  // Comments stripped: the prose in `moveCard` explains why the success path has
  // no `refresh()`, so a naive search finds the word in the very comment that
  // says it must not be there.
  const src = readFileSync(join(ROOT, 'app/composables/useKanban.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')
  const moveCard = src.slice(src.indexOf('async function moveCard'), src.indexOf('async function addColumn'))
  const onReject = moveCard.slice(moveCard.indexOf('} catch'))

  it('does not refetch on the success path', () => {
    // This is the regression the branch removed on purpose: refetching after a
    // move re-ran every card's entrance animation on every drag.
    const tryBlock = moveCard.slice(moveCard.indexOf('try {'), moveCard.indexOf('} catch'))
    expect(tryBlock).not.toMatch(/refresh\(\)/)
  })

  it('rolls back and then refetches when the move is rejected', () => {
    expect(onReject).toMatch(/s\.card\.statusId = s\.statusId/)
    expect(onReject).toMatch(/await refresh\(\)/)
    // Order matters, and reversing it is silent: a refetch that fails leaves the
    // card sitting where it was dropped, which reads as a move that worked.
    expect(onReject.indexOf('s.card.statusId')).toBeLessThan(onReject.indexOf('await refresh()'))
  })
})

/**
 * The instant-save contract, which is split by what a field actually is:
 * properties persist on change, prose stays an explicit draft.
 */
describe('useCardFieldSync', () => {
  const src = readFileSync(join(ROOT, 'app/composables/useCardFieldSync.ts'), 'utf8')

  it('saves a property only when it diverges from the card', () => {
    // A "syncing" flag would depend on watcher flush order and would have to be
    // remembered for every new field; divergence checks cannot be forgotten.
    for (const field of ['statusId', 'assigneeId', 'priority', 'dueDate']) {
      expect(src, field).toMatch(new RegExp(`watch\\(fields\\.${field}`))
    }
    expect(src).toMatch(/watch\(fields\.tagIds/)
  })

  it('debounces the title and exposes a flush for blur and close', () => {
    expect(src).toMatch(/TITLE_DEBOUNCE_MS/)
    expect(src).toMatch(/function flushTitle/)
    expect(src).toMatch(/onBeforeUnmount\([\s\S]*?flushTitle\(\)/)
  })

  it('does not force-sync title or description from the card', () => {
    // Pulling those back while someone is typing would overwrite their text. Only
    // the properties are pulled; title and description resync on a card change.
    const sync = src.slice(src.indexOf('function syncProperties'))
    const body = sync.slice(0, sync.indexOf('\n  }'))
    expect(body).not.toMatch(/fields\.title/)
  })
})
