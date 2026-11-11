/**
 * Sign out, from anywhere. Two callers — the account menu in the topbar and the
 * command palette's action — which is why it is not inlined in either.
 */
export function useSignOut() {
  const { clear } = useUserSession()
  const router = useRouter()
  const { leaveApp } = useAuthTransition()

  return async function signOut() {
    await $fetch('/auth/logout', { method: 'POST' })
    // The sign-out half of the shared timeline plays while the session is
    // still there to render the app it is leaving.
    await leaveApp(async () => {
      await clear()
      await router.push('/login')
    })
  }
}
