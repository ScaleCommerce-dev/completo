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
    if (newPassword.value.length < 6) {
      passwordError.value = 'New password must be at least 6 characters'
      return
    }
    passwordLoading.value = true
    passwordError.value = ''
    passwordSuccess.value = false
    try {
      await $fetch('/api/user/password', {
        method: 'PUT',
        body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
      })
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
