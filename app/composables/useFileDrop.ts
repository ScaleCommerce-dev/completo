/**
 * Dropping a file anywhere on a card attaches it.
 *
 * The attachments section used to own this, with the handlers on its own wrapper,
 * which had two consequences and one outright bug:
 *
 *  - The target was a strip a few rows tall in the middle of the panel. Drag a
 *    screenshot at the description or the comments and nothing lit up, because
 *    nothing there was listening.
 *  - Since nothing called `preventDefault` outside that strip, a file dropped
 *    anywhere else hit the browser's own handler and **navigated the tab to
 *    `file:///…`**, taking the card view with it. That is what the document-level
 *    guards below exist for: they run for the composable's whole lifetime and
 *    swallow the default wherever the file lands, so the worst case is a drop
 *    that does nothing rather than one that leaves the app.
 *  - The visible drop zone only appeared *once a drag was in flight*, so the
 *    layout shifted under the cursor at the one moment it must not move. The zone
 *    is permanent now (see AttachmentList) and this reports when to light it.
 *
 * **Why a timer and not enter/leave counting.** `dragenter`/`dragleave` fire for
 * every child element the pointer crosses, so tracking them directly means
 * storms of paired events and a highlight that flickers over each boundary — the
 * previous implementation papered over that with a 50ms unset timer, which is why
 * the highlight was unreliable. Here `dragover` refreshes the state instead,
 * because the drag-and-drop model re-fires it continuously over a valid target.
 *
 * The backstop is **500ms and cannot be much shorter**: the spec runs that loop
 * every 350ms, so a stationary pointer over the panel is the slowest legitimate
 * event stream there is, and a timeout below it would blink the highlight off
 * between two perfectly normal `dragover`s. Leaving is therefore detected
 * properly rather than by timeout — `dragleave` whose `relatedTarget` is outside
 * the root clears immediately — and the timer only covers the events a drag can
 * genuinely swallow, such as one ending outside the window.
 */
export function useFileDrop(opts: {
  /** The region a drop counts in. Read on each event, so it may mount late. */
  root: () => HTMLElement | null | undefined
  onFiles: (files: File[]) => void | Promise<void>
  /** False while the surface can't take an upload — a readonly card. */
  enabled?: () => boolean
}) {
  const dragging = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  /**
   * Only a file drag. A text selection dragged out of the description also fires
   * these events, and treating that as an upload would light the panel up every
   * time somebody rearranged a sentence.
   */
  function carriesFiles(e: DragEvent) {
    return !!e.dataTransfer?.types?.includes('Files')
  }

  function inRoot(node: EventTarget | null) {
    const root = opts.root()
    return !!root && node instanceof Node && root.contains(node)
  }

  function stopDragging() {
    if (timer) clearTimeout(timer)
    timer = null
    dragging.value = false
  }

  function keepDragging() {
    dragging.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      dragging.value = false
    }, 500)
  }

  function onDragOver(e: DragEvent) {
    if (!carriesFiles(e)) return
    // Unconditional, and before the enabled/containment checks: this is the call
    // that stops the browser navigating to the dropped file.
    e.preventDefault()
    if (opts.enabled?.() === false) return
    if (inRoot(e.target)) keepDragging()
    else stopDragging()
  }

  function onDragLeave(e: DragEvent) {
    if (!carriesFiles(e)) return
    // A leave into a child of the root is the pointer crossing an internal
    // boundary, not leaving. `relatedTarget` is null when it leaves the window.
    if (inRoot(e.relatedTarget)) return
    stopDragging()
  }

  async function onDrop(e: DragEvent) {
    if (!carriesFiles(e)) return
    e.preventDefault()
    const wasInRoot = inRoot(e.target)
    stopDragging()
    if (!wasInRoot || opts.enabled?.() === false) return
    const files = [...(e.dataTransfer?.files || [])]
    if (files.length) await opts.onFiles(files)
  }

  onMounted(() => {
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', stopDragging)
  })

  onUnmounted(() => {
    document.removeEventListener('dragover', onDragOver)
    document.removeEventListener('dragleave', onDragLeave)
    document.removeEventListener('drop', onDrop)
    document.removeEventListener('dragend', stopDragging)
    if (timer) clearTimeout(timer)
  })

  return { dragging }
}
