export function useCopyTicketId(
  projectSlug: MaybeRefOrGetter<string | undefined>,
  projectKey: MaybeRefOrGetter<string | undefined>,
  cardId: MaybeRefOrGetter<number>
) {
  const copiedState = ref<'id' | 'url' | null>(null)

  function showFeedback(type: 'id' | 'url') {
    copiedState.value = type
    setTimeout(() => {
      copiedState.value = null
    }, 2000)
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(
      formatTicketUrl(toValue(projectSlug), toValue(projectKey), toValue(cardId))
    )
    showFeedback('url')
  }

  async function copyId() {
    await navigator.clipboard.writeText(
      formatTicketId(toValue(projectKey), toValue(cardId))
    )
    showFeedback('id')
  }

  return { copiedState, copyUrl, copyId }
}
