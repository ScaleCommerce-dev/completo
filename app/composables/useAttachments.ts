interface Attachment {
  id: string
  cardId: number
  projectId: string
  storageKey: string
  originalName: string
  mimeType: string
  size: number
  uploadedById: string | null
  createdAt: string
}

export function useAttachments(cardId: Ref<number | null | undefined>) {
  const toast = useToast()
  const attachments = ref<Attachment[]>([])
  const loading = ref(false)
  const uploading = ref(false)

  async function fetchAttachments() {
    if (!cardId.value) return
    loading.value = true
    try {
      attachments.value = await $fetch<Attachment[]>(`/api/cards/${cardId.value}/attachments`)
    } catch {
      // Silent fail — card might not exist yet
    } finally {
      loading.value = false
    }
  }

  async function upload(file: File) {
    if (!cardId.value) return
    uploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const attachment = await $fetch<Attachment>(`/api/cards/${cardId.value}/attachments`, {
        method: 'POST',
        body: formData
      })
      attachments.value = [...attachments.value, attachment]
      toast.add({ title: 'File uploaded', color: 'success' })
      return attachment
    } catch (e: any) {
      const message = e?.data?.message || 'Failed to upload file'
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
    if (id) fetchAttachments()
    else attachments.value = []
  }, { immediate: true })

  return {
    attachments,
    loading,
    uploading,
    upload,
    remove,
    fetchAttachments,
    downloadUrl
  }
}
