import type { PersonRef } from '~/types/card'

interface Attachment {
  id: string
  cardId: number
  projectId: string
  storageKey: string
  originalName: string
  mimeType: string
  size: number
  uploadedById: string | null
  /** Who uploaded it; null once their account is gone. */
  uploader?: PersonRef | null
  createdAt: string
}

export function useAttachments(cardId: Ref<number | null | undefined>) {
  const toast = useToast()
  const attachments = ref<Attachment[]>([])
  const uploading = ref(false)

  /** Applied only while its card is still the one shown; see `useComments`. */
  async function fetchAttachments() {
    const id = cardId.value
    if (!id) return
    try {
      const list = await $fetch<Attachment[]>(`/api/cards/${id}/attachments`)
      if (cardId.value === id) attachments.value = list
    } catch {
      // Silent fail — card might not exist yet
    }
  }

  async function upload(file: File) {
    const id = cardId.value
    if (!id) return
    uploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const attachment = await $fetch<Attachment>(`/api/cards/${id}/attachments`, {
        method: 'POST',
        body: formData
      })
      if (cardId.value === id) attachments.value = [...attachments.value, attachment]
      toast.add({ title: 'File uploaded', color: 'success' })
      return attachment
    } catch (e: unknown) {
      const message = getErrorMessage(e, 'Failed to upload file')
      toast.add({ title: message, color: 'error' })
      throw e
    } finally {
      uploading.value = false
    }
  }

  async function remove(attachmentId: string) {
    try {
      await $fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
      attachments.value = attachments.value.filter(a => a.id !== attachmentId)
      toast.add({ title: 'Attachment removed', color: 'success' })
    } catch {
      toast.add({ title: 'Failed to remove attachment', color: 'error' })
    }
  }

  function downloadUrl(attachmentId: string): string {
    return `/api/attachments/${attachmentId}/download`
  }

  watch(cardId, (id) => {
    attachments.value = []
    if (id) fetchAttachments()
  }, { immediate: true })

  return {
    attachments,
    uploading,
    upload,
    remove,
    downloadUrl
  }
}
