export interface Comment {
  id: string
  cardId: number
  body: string
  authorId: string | null
  authorName: string | null
  authorAvatarUrl: string | null
  /** Null when the author's account is gone. */
  authorKind: 'human' | 'agent' | null
  authorColor: string | null
  authorManagedBy: { id: string, name: string, avatarUrl: string | null } | null
  createdAt: string
  updatedAt: string
}

export function useComments(cardId: Ref<number | null | undefined>) {
  const { mutate, toast } = useMutation()
  const comments = ref<Comment[]>([])
  const loading = ref(false)
  const saving = ref(false)

  /**
   * The panel steps between cards without remounting this list, so a response is
   * applied only while its card is still the one shown. Holding the arrow keys used
   * to leave card B showing A's thread, when A's request finished last.
   */
  async function fetchComments() {
    const id = cardId.value
    if (!id) return
    loading.value = true
    try {
      const list = await $fetch<Comment[]>(`/api/cards/${id}/comments`)
      if (cardId.value === id) comments.value = list
    } catch {
      // Silent — the card may not exist yet (new-card flow), same as useAttachments
    } finally {
      loading.value = false
    }
  }

  async function add(body: string) {
    const id = cardId.value
    if (!id || !body.trim()) return
    saving.value = true
    try {
      const comment = await mutate(
        () => $fetch<Comment>(`/api/cards/${id}/comments`, {
          method: 'POST',
          body: { body }
        }),
        'Failed to add comment'
      )
      if (cardId.value === id) comments.value = [...comments.value, comment]
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

  // A different card starts empty rather than showing the last one's thread.
  watch(cardId, (id) => {
    comments.value = []
    if (id) fetchComments()
  }, { immediate: true })

  return { comments, loading, saving, add, edit, remove }
}
