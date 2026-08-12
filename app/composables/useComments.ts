export interface Comment {
  id: string
  cardId: number
  body: string
  authorId: string | null
  authorName: string | null
  authorAvatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export function useComments(cardId: Ref<number | null | undefined>) {
  const { mutate, toast } = useMutation()
  const comments = ref<Comment[]>([])
  const loading = ref(false)
  const saving = ref(false)

  async function fetchComments() {
    if (!cardId.value) return
    loading.value = true
    try {
      comments.value = await $fetch<Comment[]>(`/api/cards/${cardId.value}/comments`)
    } catch {
      // Silent — the card may not exist yet (new-card flow), same as useAttachments
    } finally {
      loading.value = false
    }
  }

  async function add(body: string) {
    if (!cardId.value || !body.trim()) return
    saving.value = true
    try {
      const comment = await mutate(
        () => $fetch<Comment>(`/api/cards/${cardId.value}/comments`, {
          method: 'POST',
          body: { body }
        }),
        'Failed to add comment'
      )
      comments.value = [...comments.value, comment]
      return comment
    } finally {
      saving.value = false
    }
  }

  async function edit(commentId: string, body: string) {
    if (!body.trim()) return
    saving.value = true
    try {
      const updated = await mutate(
        () => $fetch<Comment>(`/api/comments/${commentId}`, {
          method: 'PUT',
          body: { body }
        }),
        'Failed to update comment'
      )
      comments.value = comments.value.map(c => (c.id === commentId ? updated : c))
      return updated
    } finally {
      saving.value = false
    }
  }

  async function remove(commentId: string) {
    await mutate(
      () => $fetch(`/api/comments/${commentId}`, { method: 'DELETE' }),
      'Failed to delete comment'
    )
    comments.value = comments.value.filter(c => c.id !== commentId)
    toast.add({ title: 'Comment deleted', color: 'success' })
  }

  watch(cardId, (id) => {
    if (id) fetchComments()
    else comments.value = []
  }, { immediate: true })

  return { comments, loading, saving, add, edit, remove, fetchComments }
}
