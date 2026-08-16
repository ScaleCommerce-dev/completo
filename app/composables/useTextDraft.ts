/**
 * Local autosave for prose that has no other home yet.
 *
 * Description and comment text live only in the editor until you save them, so
 * closing the surface loses them. The app guarded that with a blocking
 * confirmation, which produced its own bug: on a card with comments the banner
 * rendered far below the fold, so the modal simply appeared to refuse to close
 * (see the note in CLAUDE.md).
 *
 * Persisting the draft turns the guard into a safety net. Closing can no longer
 * destroy anything, so the confirmation stops being load-bearing and the text
 * comes back on reopen.
 *
 * Scope is deliberately narrow: only fields where the text has nowhere else to
 * go. Status, priority and assignee are one click to redo and show their own
 * state, so they are not worth persisting.
 */
const PREFIX = 'completo:draft:'
/** Drafts older than this are almost certainly abandoned. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

interface StoredDraft {
  text: string
  at: number
}

function key(scope: string) {
  return `${PREFIX}${scope}`
}

function read(scope: string): string | null {
  if (import.meta.server) return null
  try {
    const raw = localStorage.getItem(key(scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed?.text || Date.now() - parsed.at > MAX_AGE_MS) {
      localStorage.removeItem(key(scope))
      return null
    }
    return parsed.text
  } catch {
    // Private-mode Safari throws on localStorage access; a lost draft is
    // recoverable, a crash on card open is not.
    return null
  }
}

function write(scope: string, text: string) {
  if (import.meta.server) return
  try {
    if (!text.trim()) {
      localStorage.removeItem(key(scope))
      return
    }
    localStorage.setItem(key(scope), JSON.stringify({ text, at: Date.now() } satisfies StoredDraft))
  } catch {
    // Quota or private mode — nothing useful to do, and the in-memory value is
    // still intact for this session.
  }
}

/**
 * @param scope Stable identity for this text, e.g. `card:42:description` or
 *              `card:42:comment`. Must not collide between fields.
 * @param source The live editor value.
 * @param baseline What the server already holds, so text equal to it is not a
 *              draft. Without this the composable stores every description of
 *              every card you merely open, and `restored` would then fire on
 *              text nobody typed. Defaults to "anything non-empty is a draft",
 *              which is right for a new comment.
 */
export function useTextDraft(
  scope: MaybeRefOrGetter<string | null>,
  source: Ref<string>,
  baseline: MaybeRefOrGetter<string> = ''
) {
  /** A draft found on disk that differs from what the editor was given. */
  const restored = ref<string | null>(null)

  const resolvedScope = computed(() => toValue(scope))

  /** Text that is merely what the server already holds is not worth keeping. */
  const isDraft = (val: string) => val.trim() !== toValue(baseline).trim()

  function load() {
    const s = resolvedScope.value
    if (!s) return
    const saved = read(s)
    if (saved && saved !== source.value && isDraft(saved)) {
      restored.value = saved
      source.value = saved
    }
  }

  function clear() {
    // Drop the pending write too. An explicit discard is the one path where
    // restoring text is the wrong answer, so a write already on the timer must
    // not put it back 400ms later.
    cancel()
    const s = resolvedScope.value
    if (s) write(s, '')
    restored.value = null
  }

  function dismissNotice() {
    restored.value = null
  }

  // Debounced so a fast typist does not hit localStorage on every keystroke.
  //
  // *What* to write is decided here rather than when the timer fires, because
  // the card panel navigates between cards without remounting: by the time a
  // pending write lands, `resolvedScope` and `baseline` can both already belong
  // to the next card. Capturing the scope with the text is what keeps one card's
  // comment out of another card's key.
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { scope: string, text: string } | null = null

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }

  function flush() {
    const due = pending
    cancel()
    if (due) write(due.scope, due.text)
  }

  // `flush: 'sync'` is load-bearing, not a preference. A default pre-flush
  // watcher runs after the current tick's prop updates, so text typed on card A
  // and a navigation to card B in the same tick arrive together — and the
  // callback then reads a `resolvedScope` that already says B, filing A's text
  // under B's key. Measured: typing and navigating in one tick lost the draft
  // before this, and leaked it to the wrong card before the capture below.
  // Running synchronously pins the scope to the moment the text changed.
  // The debounce still exists — it is the localStorage write that is expensive,
  // not this.
  watch(source, (val) => {
    const s = resolvedScope.value
    // Belt and braces for any path that still changes scope first: `pending`
    // from a different scope belongs to the card we just left, so write it
    // there before this edit overwrites it.
    if (pending && pending.scope !== s) flush()
    if (!s) return
    if (timer) clearTimeout(timer)
    // `write` removes the key for empty text, so text that has caught up with
    // the server clears its own draft rather than shadowing it forever.
    pending = { scope: s, text: isDraft(val) ? val : '' }
    timer = setTimeout(flush, 400)
  }, { flush: 'sync' })

  // Navigating to another card is a scope change with no unmount, so this is the
  // departing card's only chance to have its text written.
  watch(resolvedScope, () => flush())

  // Flush synchronously: unmount is exactly the case this exists for.
  onBeforeUnmount(flush)

  return { restored, load, clear, dismissNotice }
}
