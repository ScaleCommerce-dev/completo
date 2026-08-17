interface ApiToken {
  id: string
  name: string
  tokenPrefix: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  isExpired: boolean
}

export function useApiTokens() {
  const toast = useToast()
  const tokens = ref<ApiToken[]>([])
  const tokenName = ref('')
  const tokenExpiry = ref<string>('')
  const tokenLoading = ref(false)
  const createdToken = ref<string | null>(null)
  const createdTokenName = ref('')
  const tokenCopied = ref(false)
  /**
   * The armed row, from the shared two-step (`useArmedDelete`).
   *
   * This used to hand-roll it, and got the timer backwards: `setTimeout(() =>
   * confirmDeleteToken(id), 5000)` *revoked the token* five seconds after you
   * armed the row, so arming a delete and then leaving the tab alone destroyed a
   * live API credential without a second click. Every other two-step in the app
   * used its timer to disarm. Present since the first commit and in every release.
   */
  const { armedId: deletingTokenId, arm: startDeleteToken, disarm: cancelDeleteToken } = useArmedDelete()

  async function fetchTokens() {
    try {
      tokens.value = await $fetch('/api/user/tokens') as ApiToken[]
    } catch {
      toast.add({ title: 'Failed to load API tokens', color: 'error' })
    }
  }

  onMounted(() => {
    fetchTokens()
  })

  async function createToken() {
    if (!tokenName.value.trim()) return
    tokenLoading.value = true
    try {
      const result = await $fetch('/api/user/tokens', {
        method: 'POST',
        body: {
          name: tokenName.value.trim(),
          expiresInDays: tokenExpiry.value ? Number(tokenExpiry.value) : undefined
        }
      }) as { token: string, name: string }
      createdToken.value = result.token
      createdTokenName.value = result.name
      tokenName.value = ''
      tokenExpiry.value = ''
      tokenCopied.value = false
      await fetchTokens()
    } catch (e: unknown) {
      console.error(getErrorMessage(e, 'Failed to create token'))
    } finally {
      tokenLoading.value = false
    }
  }

  async function copyToken() {
    if (!createdToken.value) return
    await navigator.clipboard.writeText(createdToken.value)
    tokenCopied.value = true
    setTimeout(() => {
      tokenCopied.value = false
    }, 3000)
  }

  async function confirmDeleteToken(id: string) {
    cancelDeleteToken()
    try {
      await $fetch(`/api/user/tokens/${id}`, { method: 'DELETE' })
      await fetchTokens()
    } catch {
      toast.add({ title: 'Failed to delete token', color: 'error' })
    }
  }

  function formatTokenDate(iso: string | null): string {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return {
    tokens,
    tokenName,
    tokenExpiry,
    tokenLoading,
    createdToken,
    createdTokenName,
    tokenCopied,
    deletingTokenId,
    createToken,
    copyToken,
    startDeleteToken,
    cancelDeleteToken,
    confirmDeleteToken,
    formatTokenDate
  }
}
