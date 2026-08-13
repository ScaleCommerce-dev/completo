/**
 * Saves a card's properties the moment they change, and keeps the editor's local
 * state in step with the card.
 *
 * The board and the list have always saved status, assignee, priority, due date
 * and tags on the click. The card modal and the card detail page batched the same
 * fields behind a Save button, so the mental model changed depending on which
 * surface you happened to be looking at. This closes that: properties are
 * instant everywhere, and Save is left holding only the description — the one
 * field that is genuinely a draft.
 *
 * ── Why divergence, not a "syncing" flag ────────────────────────────────────
 *
 * The obvious implementation is a boolean that suppresses the watchers while
 * populating local state from the card. That works until it doesn't: it depends
 * on watcher flush order, and every new field is another chance to forget it.
 *
 * Instead, each watcher asks whether the local value actually differs from the
 * card. Populating sets local == card, so the watcher sees nothing to do and
 * stays quiet. No flag, no ordering assumptions.
 *
 * ── Why this cannot loop ────────────────────────────────────────────────────
 *
 * The dangerous shape is: save fails → caller reverts the card → local and card
 * disagree → watcher fires again → save fails again.
 *
 * It can't happen here, because the property watchers observe the *local* refs,
 * and a revert changes the *card*. A card change instead runs `syncProperties`,
 * which pulls local back to the card — so a rejected edit visibly snaps back and
 * ends there. The subsequent local change from that sync is then equal to the
 * card, so the watcher returns without saving.
 *
 * Title and description are deliberately excluded from that pull: force-syncing
 * them from the card would overwrite text while it is being typed. They resync
 * only when a different card is opened.
 */

export interface CardFieldSyncCard {
  id: number
  title: string
  statusId: string
  assigneeId: string | null
  priority: string
  dueDate: string | null
  tags?: Array<{ id: string }>
}

/** `<input type="date">` and the pickers speak YYYY-MM-DD; the API speaks ISO. */
export function toDateInput(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return new Date(value).toISOString().split('T')[0] ?? null
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((id, i) => id === y[i])
}

export function useCardFieldSync(opts: {
  /** The card as the server last confirmed it, or null while creating. */
  card: () => CardFieldSyncCard | null | undefined
  fields: {
    title: Ref<string>
    statusId: Ref<string>
    assigneeId: Ref<string>
    priority: Ref<string>
    dueDate: Ref<string | null>
    tagIds: Ref<string[]>
  }
  /** Sentinel the assignee control uses for "nobody". */
  unassignedValue: string
  /** Persist one or more card columns. */
  save: (updates: Record<string, unknown>) => unknown
  /** Tags have their own endpoint. */
  saveTags: (tagIds: string[]) => unknown
  /**
   * Whether instant save applies. False while creating — there is no card to
   * save to yet, so those changes stay batched until Create.
   */
  enabled: () => boolean
  /**
   * Called when a different card is loaded, so the caller can repopulate
   * everything including the fields this composable deliberately won't touch.
   */
  onCardChanged?: () => void
}) {
  const { card, fields, unassignedValue, save, saveTags, enabled } = opts

  /** The card's assignee in the control's vocabulary. */
  const cardAssignee = () => card()?.assigneeId || unassignedValue

  // ─── Save on divergence ───────────────────────────────────────────────────

  watch(fields.statusId, (val) => {
    if (!enabled() || !val) return
    if (val === card()?.statusId) return
    save({ statusId: val })
  })

  watch(fields.assigneeId, (val) => {
    if (!enabled()) return
    if (val === cardAssignee()) return
    save({ assigneeId: val === unassignedValue ? null : val })
  })

  watch(fields.priority, (val) => {
    if (!enabled()) return
    if (val === card()?.priority) return
    save({ priority: val })
  })

  watch(fields.dueDate, (val) => {
    if (!enabled()) return
    if (val === toDateInput(card()?.dueDate)) return
    save({ dueDate: val || null })
  })

  watch(fields.tagIds, (val) => {
    if (!enabled()) return
    const current = (card()?.tags || []).map(t => t.id)
    if (sameIds(val, current)) return
    saveTags([...val])
  }, { deep: true })

  // ─── Title: debounced, because a watcher per keystroke would spam the API ──

  const TITLE_DEBOUNCE_MS = 600
  let titleTimer: ReturnType<typeof setTimeout> | null = null

  function clearTitleTimer() {
    if (titleTimer) {
      clearTimeout(titleTimer)
      titleTimer = null
    }
  }

  /** Commit the title now. Call on blur, and before closing or navigating away. */
  function flushTitle() {
    clearTitleTimer()
    if (!enabled()) return
    const val = fields.title.value.trim()
    // An empty title would blank the card; leave it to the caller's validation.
    if (!val || val === card()?.title) return
    save({ title: val })
  }

  watch(fields.title, () => {
    if (!enabled()) return
    clearTitleTimer()
    titleTimer = setTimeout(flushTitle, TITLE_DEBOUNCE_MS)
  })

  onBeforeUnmount(() => {
    // Unmount is exactly the case a debounce loses work in.
    flushTitle()
  })

  // ─── Pull the card's truth back into the properties ───────────────────────
  //
  // This is what makes a rejected save snap back, and what keeps the editor
  // correct when the same card is changed from the board underneath it.

  function syncProperties() {
    const c = card()
    if (!c) return
    fields.statusId.value = c.statusId || ''
    fields.assigneeId.value = c.assigneeId || unassignedValue
    fields.priority.value = c.priority || 'medium'
    fields.dueDate.value = toDateInput(c.dueDate)
    const ids = (c.tags || []).map(t => t.id)
    if (!sameIds(fields.tagIds.value, ids)) fields.tagIds.value = ids
  }

  watch(
    () => {
      const c = card()
      if (!c) return null
      return [c.statusId, c.assigneeId, c.priority, c.dueDate, (c.tags || []).map(t => t.id).join(',')].join('|')
    },
    () => syncProperties()
  )

  // A different card: repopulate everything, title and description included.
  watch(() => card()?.id, (id, prev) => {
    if (!card() || id === prev) return
    clearTitleTimer()
    opts.onCardChanged?.()
  })

  return { flushTitle, syncProperties }
}
