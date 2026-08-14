/**
 * Copy something, and say so on the control that did it.
 *
 * The same two seconds of feedback `useCopyTicketId` gives the ticket pill, for
 * the copy buttons that aren't about ticket IDs — the description's, and the one
 * on every code block. Colour and a swapped glyph rather than a toast: a toast for
 * an action whose result is already in your clipboard is a notification about
 * something that plainly worked.
 *
 * `writeText` rejects outside a secure context and when the document isn't
 * focused, so the failure is swallowed and simply shows nothing — an error toast
 * would be the loudest thing on screen for the least consequential failure there
 * is, and the text is still selectable by hand.
 */
export function useCopyText() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      copied.value = false
    }, 2000)
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return { copied, copy }
}
