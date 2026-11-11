interface ApiToken {
  id: string
  name: string
  tokenPrefix: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  isExpired: boolean
}

/**
 * Your own tokens by default. An agent's page passes its own endpoint, because a
 * manager mints and revokes the agent's tokens (`/api/agents/:id/tokens`), and its
 * own `list`: the agent's tokens arrive with the agent, so the list shown is that
 * data and `reload` refetches the agent. A copy kept here went stale whenever the
 * page refreshed the agent for another reason, such as a suspend revoking them all.
 */
export function useApiTokens(options: {
  endpoint?: string
  list?: { tokens: Readonly<Ref<ApiToken[]>>, reload: () => Promise<unknown> }
} = {}) {
  const endpoint = options.endpoint ?? '/api/user/tokens'
  const toast = useToast()
  const ownTokens = ref<ApiToken[]>([])
  const tokens = options.list?.tokens ?? ownTokens
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
      if (options.list) await options.list.reload()
      else ownTokens.value = await $fetch(endpoint) as ApiToken[]
    } catch {
      toast.add({ title: 'Failed to load API tokens', color: 'error' })
    }
  }

  // A caller's list is already loaded, or loading, with whatever it came with.
  onMounted(() => {
    if (!options.list) fetchTokens()
  })

  async function createToken() {
    if (!tokenName.value.trim()) return
    tokenLoading.value = true
    try {
      const result = await $fetch(endpoint, {
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
      await $fetch(`${endpoint}/${id}`, { method: 'DELETE' })
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
    formatTokenDate,
    fetchTokens
  }
}
