export function useProfileForm() {
  const { user, fetch: fetchSession } = useUserSession()

  const profileName = ref(user.value?.name || '')
  const profileAvatarUrl = ref(user.value?.avatarUrl || '')
  const profileColorMode = ref(user.value?.colorMode || 'system')
  const profileLoading = ref(false)
  const profileError = ref('')
  const profileSuccess = ref(false)

  // Gravatar
  const gravatarUrl = ref('')
  const hasGravatar = ref<boolean | null>(null)
  const gravatarOverride = ref(false)

  async function sha256(str: string): Promise<string> {
    const data = new TextEncoder().encode(str)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  onMounted(async () => {
    if (user.value?.email) {
      const hash = await sha256(user.value.email.trim().toLowerCase())
      const url = `https://gravatar.com/avatar/${hash}?d=404&s=160`
      gravatarUrl.value = url
      const img = new Image()
      img.onload = () => {
        hasGravatar.value = true
      }
      img.onerror = () => {
        hasGravatar.value = false
      }
      img.src = url
    } else {
      hasGravatar.value = false
    }
  })

  watch(user, (u) => {
    if (u) {
      profileName.value = u.name || ''
      profileAvatarUrl.value = u.avatarUrl || ''
      profileColorMode.value = u.colorMode || 'system'
    }
  }, { immediate: true })

  async function saveProfile() {
    if (!profileName.value.trim()) return
    profileLoading.value = true
    profileError.value = ''
    profileSuccess.value = false
    try {
      const avatarToSave = (hasGravatar.value && !gravatarOverride.value) ? gravatarUrl.value.replace('?d=404&s=160', '?s=160') : (profileAvatarUrl.value || null)
      await $fetch('/api/user/profile', {
        method: 'PUT',
        body: { name: profileName.value, avatarUrl: avatarToSave, colorMode: profileColorMode.value }
      })
      await fetchSession()
      profileSuccess.value = true
      setTimeout(() => profileSuccess.value = false, 3000)
    } catch (e: unknown) {
      profileError.value = getErrorMessage(e, 'Failed to update profile')
    } finally {
      profileLoading.value = false
    }
  }

  function handleProfileKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      saveProfile()
    }
  }

  return {
    profileName,
    profileAvatarUrl,
    profileColorMode,
    profileLoading,
    profileError,
    profileSuccess,
    gravatarUrl,
    hasGravatar,
    gravatarOverride,
    saveProfile,
    handleProfileKeydown
  }
}
