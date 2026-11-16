/**
 * ⌘↵ / Ctrl+↵ commits the surface you are in, through one document listener.
 *
 * It has to be a document capture listener: overlays render into portals, so a
 * `@keydown` on the form never sees a key pressed in a menu or popover it opened.
 * Each surface used to add its own such listener and `stopImmediatePropagation`,
 * so which one won depended on mount order, and two that both claimed every ⌘↵
 * (a create dialog and a page form) could fire the wrong commit.
 *
 * One listener now picks one handler:
 * - a handler `within` a selector claims the key when it comes from inside a
 *   matching element (a comment editor inside the card panel), whatever mounted
 *   first;
 * - otherwise the most recently mounted handler that is `active` claims it, which
 *   is the topmost surface, since a dialog mounts after the page beneath it.
 * A handler that is not active is skipped rather than swallowing the key.
 */
interface CmdEnterHandler {
  run: (e: KeyboardEvent) => void
  /** Claim only keys pressed inside an element matching this selector. */
  within?: string
  /** Whether this surface has anything to commit right now. */
  active?: () => boolean
}

const handlers: CmdEnterHandler[] = []
let installed = false

function onKeydown(e: KeyboardEvent) {
  if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return
  const target = e.target as HTMLElement | null
  const live = handlers.filter(h => h.active?.() ?? true).reverse()
  const handler = live.find(h => h.within && target?.closest?.(h.within))
    ?? live.find(h => !h.within)
  if (!handler) return
  e.preventDefault()
  e.stopImmediatePropagation()
  handler.run(e)
}

export function useCmdEnter(run: (e: KeyboardEvent) => void, opts: Omit<CmdEnterHandler, 'run'> = {}) {
  const handler: CmdEnterHandler = { run, ...opts }
  onMounted(() => {
    handlers.push(handler)
    if (!installed) {
      document.addEventListener('keydown', onKeydown, true)
      installed = true
    }
  })
  onUnmounted(() => {
    const at = handlers.indexOf(handler)
    if (at >= 0) handlers.splice(at, 1)
  })
}
