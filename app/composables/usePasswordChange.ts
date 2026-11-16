import { PASSWORD_MIN_LENGTH } from '#shared/utils/auth-messages'

export function usePasswordChange() {
  const currentPassword = ref('')
  const newPassword = ref('')
  const confirmPassword = ref('')
  const passwordLoading = ref(false)
  const passwordError = ref('')
  const passwordSuccess = ref(false)

  async function changePassword() {
    if (!currentPassword.value || !newPassword.value) return
    if (newPassword.value !== confirmPassword.value) {
      passwordError.value = 'New passwords do not match'
      return
    }
    if (newPassword.value.length < PASSWORD_MIN_LENGTH) {
      passwordError.value = `New password must be at least ${PASSWORD_MIN_LENGTH} characters`
      return
    }
    passwordLoading.value = true
    passwordError.value = ''
    passwordSuccess.value = false
    try {
      const result = await $fetch<{ revokedTokens: number, revokedGrants: number, revokedAgentTokens: number }>('/api/user/password', {
        method: 'PUT',
        body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
      })
      // A change revokes what a past holder of the password could have minted; say so,
      // or a CI pipeline breaking an hour later is a mystery.
      const revoked = [
        result.revokedTokens ? plural(result.revokedTokens, 'API token') : '',
        result.revokedGrants ? plural(result.revokedGrants, 'connected app') : '',
        result.revokedAgentTokens ? plural(result.revokedAgentTokens, 'agent token') : ''
      ].filter(Boolean)
      if (revoked.length) {
        useToast().add({ title: 'Password changed', description: `${new Intl.ListFormat('en', { type: 'conjunction' }).format(revoked)} revoked. Create new ones where you still need them.`, color: 'info' })
      }
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      passwordSuccess.value = true
      setTimeout(() => passwordSuccess.value = false, 3000)
    } catch (e: unknown) {
      passwordError.value = getErrorMessage(e, 'Failed to change password')
    } finally {
      passwordLoading.value = false
    }
  }

  function handlePasswordKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      changePassword()
    }
  }

  return {
    currentPassword,
    newPassword,
    confirmPassword,
    passwordLoading,
    passwordError,
    passwordSuccess,
    changePassword,
    handlePasswordKeydown
  }
}
