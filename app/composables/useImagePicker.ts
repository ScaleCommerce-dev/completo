/**
 * The image picker behind both editors' image button: the card's own image
 * attachments, and a field for an address. Each editor had this state word for
 * word; what differs is how an image is written (a node, or Markdown at the
 * caret), so that is the `insert` passed in.
 */
interface ImageAttachment { id: string, originalName: string, mimeType?: string }

export function useImagePicker(cardId: () => number | null | undefined, insert: (alt: string, src: string) => void) {
  const open = ref(false)
  const attachments = ref<ImageAttachment[]>([])
  const url = ref('')

  async function openPicker() {
    open.value = true
    attachments.value = []
    url.value = ''
    const id = cardId()
    if (!id) return
    try {
      const all = await $fetch<ImageAttachment[]>(`/api/cards/${id}/attachments`)
      attachments.value = all.filter(a => a.mimeType?.startsWith('image/'))
    } catch {
      // A card whose attachments cannot be listed still has the address field.
    }
  }

  function closePicker() {
    open.value = false
    attachments.value = []
    url.value = ''
  }

  function pick(alt: string, src: string) {
    insert(alt, src)
    closePicker()
  }

  function pickAttachment(att: { id: string, originalName: string }) {
    pick(att.originalName, `/api/attachments/${att.id}/download`)
  }

  function pickUrl() {
    const value = url.value.trim()
    if (value) pick('', value)
  }

  return { open, attachments, url, openPicker, closePicker, pickAttachment, pickUrl }
}
