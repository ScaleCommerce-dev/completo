/**
 * Sign out, from anywhere: the account menu in the topbar, the command palette's
 * action and the profile page all use this one, so each gets the transition and
 * says when the server could not sign the session out.
 */
export function useSignOut() {
  const { clear } = useUserSession()
  const router = useRouter()
  const { leaveApp } = useAuthTransition()

  const toast = useToast()

  /** Resolves false when the server did not sign the session out; the user is told. */
  return async function signOut(): Promise<boolean> {
    try {
      await $fetch('/auth/logout', { method: 'POST' })
    } catch (e) {
      toast.add({ title: 'Couldn\'t sign out', description: getErrorMessage(e, 'Check your connection and try again.'), color: 'error' })
      return false
    }
    // The sign-out half of the shared timeline plays while the session is
    // still there to render the app it is leaving.
    await leaveApp(async () => {
      await clear()
      await router.push('/login')
    })
    return true
  }
}
