/**
 * Put text on the clipboard, and say whether it worked. Every copy in the app
 * goes through this.
 *
 * `navigator.clipboard` exists only in a secure context, so on a plain-HTTP LAN
 * install it is `undefined`, and the copy calls that used it directly threw:
 * copying a one-time API token did nothing, and the token is never shown again.
 * The fallback is the old `execCommand('copy')` on a hidden field, which still
 * works there. Callers that copy something irreplaceable say so when this
 * returns false; the rest show nothing, since the text is still on screen.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Not focused, or refused: try the fallback below.
  }
  return copyWithSelection(text)
}

function copyWithSelection(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  const previous = document.activeElement as HTMLElement | null
  document.body.appendChild(field)
  field.select()
  let ok: boolean
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  field.remove()
  previous?.focus?.()
  return ok
}
