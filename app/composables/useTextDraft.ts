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
    const s = resolvedScope.value
    if (s) write(s, '')
    restored.value = null
  }

  function dismissNotice() {
    restored.value = null
  }

  // Debounced so a fast typist does not hit localStorage on every keystroke.
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(source, (val) => {
    const s = resolvedScope.value
    if (!s) return
    if (timer) clearTimeout(timer)
    // `write` removes the key for empty text, so text that has caught up with
    // the server clears its own draft rather than shadowing it forever.
    timer = setTimeout(() => write(s, isDraft(val) ? val : ''), 400)
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
    // Flush synchronously: unmount is exactly the case this exists for.
    const s = resolvedScope.value
    if (s) write(s, isDraft(source.value) ? source.value : '')
  })

  return { restored, load, clear, dismissNotice }
}
