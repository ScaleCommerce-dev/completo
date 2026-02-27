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
  const deletingTokenId = ref<string | null>(null)
  const deleteTokenTimer = ref<ReturnType<typeof setTimeout> | null>(null)

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

  function startDeleteToken(id: string) {
    deletingTokenId.value = id
    deleteTokenTimer.value = setTimeout(() => {
      confirmDeleteToken(id)
    }, 5000)
  }

  function cancelDeleteToken() {
    if (deleteTokenTimer.value) clearTimeout(deleteTokenTimer.value)
    deletingTokenId.value = null
    deleteTokenTimer.value = null
  }

  async function confirmDeleteToken(id: string) {
    if (deleteTokenTimer.value) clearTimeout(deleteTokenTimer.value)
    try {
      await $fetch(`/api/user/tokens/${id}`, { method: 'DELETE' })
      await fetchTokens()
    } catch {
      toast.add({ title: 'Failed to delete token', color: 'error' })
    } finally {
      deletingTokenId.value = null
      deleteTokenTimer.value = null
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
