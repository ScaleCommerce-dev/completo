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

  // Through `writeClipboard`, which works on a plain-HTTP install too; a copy that
  // still fails shows no "copied", rather than an unhandled rejection.
  async function copyUrl() {
    if (await writeClipboard(formatTicketUrl(toValue(projectSlug), toValue(projectKey), toValue(cardId)))) showFeedback('url')
  }

  async function copyId() {
    if (await writeClipboard(formatTicketId(toValue(projectKey), toValue(cardId)))) showFeedback('id')
  }

  return { copiedState, copyUrl, copyId }
}
