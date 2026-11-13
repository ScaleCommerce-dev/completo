// The card panel (CardModal, opened from My Tasks, boards and lists) saves
// each property on change through `useCardFieldSync`. A card with no priority
// (null, "No priority", which the tracker interface creates) must stay null:
// syncing it to 'medium' made the save watcher write 'medium' back to the card.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createRequire } from 'node:module'

// `vue` is not a direct dependency (pnpm does not hoist it), so it is reached
// through nuxt, which is.
const fromNuxt = createRequire(createRequire(import.meta.url).resolve('nuxt/package.json'))
const { ref, watch, nextTick, reactive } = fromNuxt('vue') as typeof import('vue')

type Sync = typeof import('../../app/composables/useCardFieldSync')['useCardFieldSync']
let useCardFieldSync: Sync

beforeAll(async () => {
  // Nuxt auto-imports these; the composable is plain Vue otherwise.
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('onBeforeUnmount', () => {})
  useCardFieldSync = (await import('../../app/composables/useCardFieldSync')).useCardFieldSync
})

function setup(priority: string | null) {
  const card = reactive({ id: 1, title: 'T', statusId: 's1', assigneeId: null as string | null, priority, dueDate: null, tags: [] as Array<{ id: string }> })
  const fields = {
    title: ref('T'),
    statusId: ref('s1'),
    assigneeId: ref('__none__'),
    priority: ref<string | null>(priority),
    dueDate: ref<string | null>(null),
    tagIds: ref<string[]>([])
  }
  const save = vi.fn()
  const sync = useCardFieldSync({
    card: () => card,
    fields,
    unassignedValue: '__none__',
    save,
    saveTags: vi.fn(),
    enabled: () => true
  })
  return { card, fields, save, sync }
}

describe('useCardFieldSync priority', () => {
  it('keeps a null priority null when the card is synced, and saves nothing', async () => {
    const { fields, save, sync } = setup(null)
    sync.syncProperties()
    await nextTick()
    expect(fields.priority.value).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps it null when another field of the card changes underneath', async () => {
    const { card, fields, save } = setup(null)
    card.statusId = 's2'
    await nextTick()
    await nextTick()
    expect(fields.statusId.value).toBe('s2')
    expect(fields.priority.value).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('choosing "No priority" on a card that has one saves null', async () => {
    const { fields, save } = setup('high')
    fields.priority.value = null
    await nextTick()
    expect(save).toHaveBeenCalledWith({ priority: null })
  })
})
